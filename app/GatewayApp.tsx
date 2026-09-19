import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Image, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { platformBridge, type Fixture, type ReminderContext, type ReminderStatus } from '../modules/local-platform';
import { providers, type ProviderId } from '../src/gateway/providers';
import { dayWindow, selectToday } from '../src/domain/planning';
import { dateInstant, shiftDate, validateReminderContext } from '../src/domain/lifecycle';
import { movePhoto } from '../src/domain/inbox';
import { labels } from '../src/domain/sharing';
import { listHistoryPage, markUserOutcome, type HistoryRow, type HistoryFilter, type HistoryCursor } from '../src/storage/history';
import { listAssets, registerPhotos, type AssetRow } from '../src/storage/inbox';
import { archiveDay, loadDay, saveDay, listDays, type DailyDraft } from '../src/storage/lifecycle';
import { connectSource, syncSource, type SourceStatus } from '../src/services/sources';
import { collectExpired, purgeSelected, resetLocalData, resetPending, resumeDeletions } from '../src/services/maintenance';
import { shareFixtures } from '../src/services/share';
import { configureReminder } from '../src/services/reminders';

type Tab = '오늘' | '사진' | '이력' | '설정';
const tabs: Tab[] = ['오늘', '사진', '이력', '설정'];
function Action({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.button, disabled && styles.disabled]}><Text style={styles.buttonText}>{title}</Text></Pressable>;
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.panel}><Text style={styles.heading}>{title}</Text>{children}</View>;
}
const initialDay = (): DailyDraft => ({ serviceDate: dayWindow(Date.now()).serviceDate, revision: 0, ids: [], caption: '오늘의 기록입니다.', archivedAt: null });
export default function GatewayApp() {
  const [tab, setTab] = useState<Tab>('오늘');
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [day, setDay] = useState<DailyDraft>(initialDay);
  const currentDay = useRef(day); const dirty = useRef(false); const initialized = useRef(false);
  const [dateInput, setDateInput] = useState(day.serviceDate);
  const [provider, setProvider] = useState<ProviderId>('instagram'); const currentProvider = useRef<ProviderId>('instagram');
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('UNRESOLVED');
  const historyFilterRef = useRef<HistoryFilter>('UNRESOLVED');
  const [historyNext, setHistoryNext] = useState<HistoryCursor | null>(null);
  const historyCursorRef = useRef<HistoryCursor | null>(null);
  const [historyTotal, setHistoryTotal] = useState(0);
  async function refreshHistory(append = false, filter: HistoryFilter = historyFilterRef.current) {
    const page = await listHistoryPage({ filter, cursor: append ? historyCursorRef.current : null });
    historyFilterRef.current = filter; historyCursorRef.current = page.next;
    setHistoryFilter(filter); setHistoryNext(page.next); setHistoryTotal(page.total);
    setHistory(rows => append ? [...rows, ...page.rows.filter(row => !rows.some(old => old.id === row.id))] : page.rows);
  }
  const [days, setDays] = useState<{service_date: string; head_revision: number; archived_at: number | null}[]>([]);
  const [reminder, setReminder] = useState<ReminderStatus | null>(null);
  const [pending, setPending] = useState<ReminderContext | null>(null);
  const [source, setSource] = useState<SourceStatus | null>(null); const [sourceError, setSourceError] = useState('');
  const [bytes, setBytes] = useState(0);
  const [hour, setHour] = useState('9'); const [minute, setMinute] = useState('0');
  const [notice, setNotice] = useState('개발 후보입니다. 실기/SNS 호환성은 아직 검증하지 않았습니다.');
  const [busy, setBusy] = useState(false); const lock = useRef(false);
  const [resetBlocked, setResetBlocked] = useState(false);
  function showDay(value: DailyDraft, unsaved = false) { currentDay.current = value; dirty.current = unsaved; setDay(value); setDateInput(value.serviceDate); }
  async function persist(ids = currentDay.current.ids): Promise<DailyDraft> {
    const value = await saveDay({ ...currentDay.current, ids }); showDay(value); return value;
  }
  async function openDate(date: string) {
    dateInstant(date);
    if (dirty.current) await persist();
    showDay(await loadDay(date)); setTab('오늘');
  }
  async function refresh(scan = true) {
    const resetting = await resetPending(); setResetBlocked(resetting);
    if (resetting) { await resetLocalData(); initialized.current = false; setResetBlocked(false); }
    await resumeDeletions();
    await registerPhotos(await platformBridge().inventoryPhotos(), true);
    await collectExpired();
    if (scan) {
      try { setSource(await syncSource()); setSourceError(''); }
      catch { setSourceError('폴더/앨범 조회 또는 가져오기 실패입니다. 사진 없음으로 처리하지 않습니다. 권한·소스·용량을 확인한 뒤 다시 연결/새로고침하세요.'); }
    }
    // Source import can recreate a previously purged identical hash. Replay its tombstone before listing.
    await resumeDeletions();
    const alarm = await platformBridge().reminderStatus();
    setAssets(await listAssets(currentProvider.current)); await refreshHistory(); setDays(await listDays()); setReminder(alarm);
    setBytes((await platformBridge().managedFiles()).reduce((n, file) => n + file.bytes, 0));
    setPending(validateReminderContext(await platformBridge().pendingReminder()) as ReminderContext | null);
    if (!initialized.current) { showDay(await loadDay(dayWindow(Date.now()).serviceDate)); setHour(String(alarm.hour)); setMinute(String(alarm.minute)); initialized.current = true; }
  }
  async function run(operation: () => Promise<unknown>) {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try {
      if (await resetPending()) {
        setResetBlocked(true); await resetLocalData();
        initialized.current = false; dirty.current = false; setFixtures([]); setResetBlocked(false);
        await refresh(false); setNotice('중단된 초기화를 완료했습니다. 삭제 전 요청한 작업은 다시 실행하지 않았습니다.');
        return;
      }
      await operation();
    }
    catch (error) {
      const code = error instanceof Error ? error.message : '';
      setNotice(code.includes('UNCONFIRMED_SHARES_PROTECTED') ? '게시 여부 미확인인 공유가 있어 삭제하지 않았습니다. 이력에서 결과를 직접 확인한 뒤 다시 시도하세요.'
        : code.includes('REVISION_CONFLICT') ? '다른 저장과 버전이 달라 덮어쓰지 않았습니다. 날짜를 다시 열어 확인하세요.'
        : code.includes('DAY_ARCHIVED') ? '정리 대상으로 닫힌 묶음입니다. 다시 편집하려면 날짜 묶음을 다시 여세요.'
        : '작업 완료를 확인하지 못했습니다. 날짜·권한·파일·용량을 확인하세요. 기존 데이터와 미확인 공유를 자동 초기화/재전송하지 않습니다.');
    } finally {
      try { setResetBlocked(await resetPending()); } catch { setResetBlocked(true); }
      lock.current = false; setBusy(false);
    }
  }
  useEffect(() => {
    void run(() => refresh());
    const listener = AppState.addEventListener('change', state => { if (state === 'active' && !lock.current) void run(() => refresh()); });
    return () => listener.remove();
  }, []);
  async function autoSelect() {
    const result = selectToday(assets.map(a => ({ id: a.id, registeredAt: a.registered_at, timestampBasis: a.basis, state: 'READY', alreadyShared: !!a.already_shared })), dateInstant(day.serviceDate));
    if (result.requiresSelection) { setNotice('날짜 대상이 10장을 넘습니다. 사진함에서 직접 고르세요. 기존 선택은 지우지 않았습니다.'); }
    else { await persist(result.eligible.map(a => a.id)); setNotice('해당 날짜 오전 9시 이전 등록분을 저장했습니다. 날짜 불명확/이전 공유 시도는 자동 포함하지 않았습니다.'); }
    setTab('사진');
  }
  function confirm(title: string, message: string, operation: () => Promise<unknown>, destructive = false) {
    Alert.alert(title, message, [{ text: '취소', style: 'cancel' }, { text: destructive ? '확인 후 삭제' : '계속', style: destructive ? 'destructive' : 'default', onPress: () => { void run(operation); } }]);
  }
  function requestShare(synthetic = false) {
    const snapshot = { ...currentDay.current, ids: [...currentDay.current.ids] }; const target = currentProvider.current;
    const paths = synthetic ? fixtures.map(f => f.uri) : snapshot.ids.map(id => assets.find(a => a.id === id)?.uri ?? '');
    if (!paths.length) return;
    confirm('사진·날짜·공개 범위 확인', `${snapshot.serviceDate} 공유분입니다. 같은 SNS로 이미 공유한 사진인지 확인하세요. 수신 SNS 앱은 게시 전에도 업로드할 수 있습니다. 실제 게시 성공은 확인하지 못합니다.`, async () => {
      const saved = synthetic ? undefined : await saveDay(snapshot);
      if (saved) showDay(saved);
      await shareFixtures(target, paths, snapshot.caption, synthetic ? undefined : snapshot.ids, saved ? { serviceDate: saved.serviceDate, revision: saved.revision } : undefined);
      await refresh(false); setNotice('공유 시도를 기록했습니다. 게시 여부는 미확인입니다. 사진 묶음은 다음 SNS 공유를 위해 유지합니다.');
    });
  }
  const editable = !busy && !resetBlocked && day.archivedAt === null;
  const selected = day.ids;
  return <SafeAreaView style={styles.safe}>
    <View style={styles.header}><Text style={styles.brand}>SNS Gateway</Text><Text style={styles.sub}>기기 내부 · API 키 없음 · 최종 게시 수동</Text></View>
    <View style={styles.tabs}>{tabs.map(item => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: tab === item }} onPress={() => setTab(item)} style={[styles.tab, tab === item && styles.selected]}><Text>{item}</Text></Pressable>)}</View>
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text>
      {resetBlocked && <Text style={styles.warn}>이전 로컬 삭제가 미완료입니다. 상태 새로고침으로 재개하세요. 원본은 삭제하지 않습니다.</Text>}
      {pending && <Panel title="알림 날짜를 확인하세요">
        <Text style={styles.text}>{pending.serviceDate} · {pending.basis === 'DELIVERY_DATE' ? 'iOS 반복 알림의 전달일입니다. 지연 전달일 수 있으므로 게시할 날짜를 직접 확인하세요.' : '알림에 저장된 원래 예약일입니다.'} 오늘 사진과 자동으로 합치지 않습니다.</Text>
        <Action title="표시된 날짜 묶음 열기" disabled={busy} onPress={() => { void run(async () => { await openDate(pending.serviceDate); await platformBridge().acknowledgeReminder(pending.token); setPending(null); }); }} />
        <Action title="오늘 날짜를 선택" disabled={busy} onPress={() => { void run(async () => { await openDate(dayWindow(Date.now()).serviceDate); await platformBridge().acknowledgeReminder(pending.token); setPending(null); }); }} />
      </Panel>}
      {tab === '오늘' && <>
        <Panel title={`${day.serviceDate} 사진 묶음 · 버전 ${day.revision}${dirty.current ? ' · 저장 안 된 수정' : ''}`}>
          <Text style={styles.text}>한국 시간 00:00 이상 09:00 미만 등록분. {day.archivedAt ? '정리 대상으로 닫힘' : '편집 가능'}. 게시함 {assets.length}장.</Text>
          <TextInput accessibilityLabel="공유 기준 날짜" editable={!busy} value={dateInput} onChangeText={setDateInput} placeholder="YYYY-MM-DD" style={styles.input}/>
          <Action title="날짜 열기" disabled={busy} onPress={() => { void run(() => openDate(dateInput)); }} />
          <View style={styles.photos}><Action title="전날" disabled={busy} onPress={() => { void run(() => openDate(shiftDate(day.serviceDate, -1))); }} /><Action title="오늘" disabled={busy} onPress={() => { void run(() => openDate(dayWindow(Date.now()).serviceDate)); }} /></View>
          <Action title="해당 날짜 대상 고르기" disabled={!editable} onPress={() => { void run(autoSelect); }} />
          <Action title="상태 새로고침" disabled={busy} onPress={() => { void run(() => refresh()); }} />
          <Action title={day.archivedAt ? '날짜 묶음 다시 열기' : '완료/폐기 묶음으로 닫기 (7일 후 정리 대상)'} disabled={busy || day.revision === 0} onPress={() => confirm('날짜 묶음 보존', '닫힌 묶음은 모든 미확인 공유가 해결된 뒤 7일이 지나면 앱 사본만 정리됩니다. 원본과 이력은 보존합니다.', async () => { if (dirty.current) await persist(); await archiveDay(day.serviceDate, day.archivedAt === null); showDay(await loadDay(day.serviceDate)); await refresh(false); })} />
          <Text style={styles.text}>다음 OS 예약/요청: {reminder?.nextAt ? new Date(reminder.nextAt).toLocaleString('ko-KR', {timeZone:'Asia/Seoul'}) : '확인되지 않음'}</Text>
          <Text style={styles.warn}>Android 알림은 지연될 수 있습니다. 알림 전달이나 SNS 공개 시각을 보장하지 않습니다.</Text>
        </Panel>
        <Panel title="SNS 희망 대상">
          {providers.map(item => <Action key={item.id} title={`${provider === item.id ? '선택: ' : ''}${item.name} · 실기 미시험`} disabled={busy} onPress={() => { void run(async () => { currentProvider.current=item.id; setProvider(item.id); setAssets(await listAssets(item.id)); }); }} />)}
          <Text style={styles.text}>계정 인증이 아닙니다. 실제 SNS와 계정은 공유 메뉴에서 확인합니다.</Text>
        </Panel>
      </>}
      {tab === '사진' && <>
        <Panel title="로컬 게시함">
          <Action title="기기 사진 가져오기 (최대 10장)" disabled={!editable} onPress={() => { void run(async () => {
            const result=await platformBridge().pickPhotos(); const added=await registerPhotos(result.photos); await refresh(false);
            setNotice(`새 등록 ${added}장 / 건너뜀 ${result.skipped}장. 사진을 수동 선택하거나 날짜 대상 고르기를 누르세요.`);
          }); }} />
          <Text style={styles.text}>지정 폴더/앨범 자동 연동은 앱 재개·새로고침 때 동작합니다. 새로 발견한 사진은 실제 추가시각을 모르므로 날짜 확인 후 수동 포함하세요.</Text>
          {assets.map(a => <View key={a.id} style={styles.history}>
            <View style={styles.photos}><Image source={{uri:a.uri}} accessibilityLabel="게시함 사진" style={styles.photo}/><Text style={styles.text}>{a.basis==='FIRST_OBSERVED'?'날짜 확인 필요 · 소스/복구 사본':new Date(a.registered_at!).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}{a.already_shared?'\n희망 SNS로 공유 시도 있음':''}</Text></View>
            <Action title={selected.includes(a.id)?'선택 해제':'이 날짜에 수동 포함 (날짜/재공유 확인)'} disabled={!editable || (!selected.includes(a.id)&&selected.length>=10)} onPress={() => { void run(() => persist(selected.includes(a.id)?selected.filter(id=>id!==a.id):[...selected,a.id])); }} />
          </View>)}
          {!assets.length&&<Text>등록된 사용 가능한 사본이 없습니다.</Text>}
        </Panel>
        <Panel title={`${day.serviceDate} 공유 순서 · ${selected.length}장`}>
          {selected.map((id,index)=><View key={id} style={styles.history}>
            <Text>{index+1}번 · {assets.some(a=>a.id===id)?'공유 사본':'정리되거나 사용할 수 없는 사본'}</Text>
            {assets.find(a=>a.id===id)&&<Image source={{uri:assets.find(a=>a.id===id)!.uri}} style={styles.photo}/>}
            <View style={styles.photos}><Action title="앞으로" disabled={!editable||index===0} onPress={()=>{void run(()=>persist(movePhoto(selected,index,-1)));}}/><Action title="제외" disabled={!editable} onPress={()=>{void run(()=>persist(selected.filter(x=>x!==id)));}}/></View>
          </View>)}
          <TextInput accessibilityLabel="게시 문구" editable={editable} multiline maxLength={2200} value={day.caption} onChangeText={caption=>showDay({...currentDay.current,caption},true)} style={styles.input}/>
          {selected.some(id=>!assets.some(a=>a.id===id))&&<Action title="사용 가능한 사본만 남기고 저장" disabled={!editable} onPress={()=>{void run(()=>persist(selected.filter(id=>assets.some(a=>a.id===id))));}}/>}
          <Action title="사진·문구 묶음 저장" disabled={!editable} onPress={()=>{void run(()=>persist());}}/>
          <Action title="문구 복사" disabled={busy} onPress={()=>{void run(()=>platformBridge().copyCaption(day.caption));}}/>
          <Action title="선택한 사진 공유" disabled={!editable||!selected.length||selected.some(id=>!assets.some(a=>a.id===id))} onPress={()=>requestShare()}/>
          <Action title="선택 사본을 기기 게시함에서 삭제" disabled={busy||!selected.length} onPress={()=>confirm('앱 사본 삭제','휴대폰 원본과 공유 당시 이력은 보존합니다. 미확인 공유가 연결된 사진은 보호합니다. 정리한 동일 사진은 자동 재등록하지 않습니다.',async()=>{if(dirty.current)await persist();await purgeSelected(selected); showDay(await loadDay(day.serviceDate)); await refresh(false);},true)}/>
        </Panel>
        <Panel title="합성 공유 시험">
          {[1,3].map(n=><Action key={n} title={`합성 사진 ${n}장 만들기`} disabled={busy} onPress={()=>{void run(async()=>setFixtures(await platformBridge().makeFixtures(n)));}}/>)}
          <View style={styles.photos}>{fixtures.map(f=><Image key={f.uri} source={{uri:f.uri}} accessibilityLabel={f.label} style={styles.photo}/>)}</View>
          <Action title="합성 사진 공유" disabled={busy||!fixtures.length} onPress={()=>requestShare(true)}/>
        </Panel>
      </>}
      {tab === '이력' && <>
        <Panel title="날짜별 보존 묶음">{days.map(d=><Action key={d.service_date} title={`${d.service_date} · 버전 ${d.head_revision}${d.archived_at?' · 닫힘':''}`} disabled={busy} onPress={()=>{void run(()=>openDate(d.service_date));}}/>)}</Panel>
        <Panel title="공유 이력 · 원격 게시 확인 아님">
          <Text style={styles.text}>{historyFilter === 'UNRESOLVED' ? '미확인·오류 이력' : '전체 이력'} · {history.length} / {historyTotal}건. 오래된 기록도 조회할 수 있습니다.</Text>
          <Action title="미확인·오류 이력 모두 보기" disabled={busy} onPress={()=>{void run(()=>refreshHistory(false,'UNRESOLVED'));}}/>
          <Action title="전체 이력 처음부터" disabled={busy} onPress={()=>{void run(()=>refreshHistory(false,'ALL'));}}/>
          {!history.length && <Text style={styles.text}>현재 필터에 해당하는 이력이 없습니다.</Text>}
          {history.map(row=><View key={row.id} style={styles.history}>
            <Text style={styles.heading}>{row.intended_target} · {row.service_date??'이전/시험 묶음'} · 버전 {row.revision??'-'}</Text>
            <Text style={styles.text}>{labels[row.state]} · {row.evidence}</Text><Text>관측 대상: {row.observed_target??'알 수 없음'}</Text>
            <Text style={styles.text}>당시 문구: {row.caption}</Text>
            <Action title="게시했다고 표시 (사용자 진술)" disabled={busy||row.state==='REQUESTED'} onPress={()=>{void run(async()=>{await markUserOutcome(row,true);setAssets(await listAssets(currentProvider.current));await refreshHistory();});}}/>
            <Action title="취소했다고 표시" disabled={busy||row.state==='REQUESTED'} onPress={()=>{void run(async()=>{await markUserOutcome(row,false);setAssets(await listAssets(currentProvider.current));await refreshHistory();});}}/>
          </View>)}
          {historyNext && <Action title="이전 기록 더 보기 (최대 100건)" disabled={busy} onPress={()=>{void run(()=>refreshHistory(true));}}/>}
        </Panel>
      </>}
      {tab === '설정' && <>
        <Panel title="지정 소스 연결">
          <Text style={styles.text}>{source?`${source.scan.label} · 목록 ${source.scan.items.length}개 · 대기 ${source.pending}개 · 이번 가져오기 ${source.imported}개`:'연결된 소스 없음 또는 조회 전'}</Text>
          {sourceError?<Text style={styles.warn}>{sourceError}</Text>:null}
          <Text style={styles.text}>처음 연결한 기존 사진은 가져오지 않습니다. 앱 재개/새로고침당 새 사진 최대 10장, 목록 최대 2,000개입니다. 아이폰은 직접 만든 앨범과 전체 사진 접근이 필요하며 제한 권한에서는 게시함을 사용하세요.</Text>
          <Action title={Platform.OS==='ios'?'사진 앨범 선택/변경':'로컬 폴더 선택/변경'} disabled={busy} onPress={()=>{void run(async()=>{const result=await connectSource();if(result){setSource(result);setSourceError('');setNotice('기존 사진은 기준 목록으로만 기록했습니다. 다음 새 사진부터 날짜 확인 후보로 가져옵니다.');}});}}/>
          <Action title="새 사진 확인/다음 10장 가져오기" disabled={busy} onPress={()=>{void run(()=>refresh());}}/>
          <Action title="소스 연결 해제" disabled={busy} onPress={()=>{void run(async()=>{await platformBridge().disconnectSource();setSource(null);setSourceError('');});}}/>
        </Panel>
        <Panel title="로컬 예약 알림">
          <Text style={styles.text}>한국 시간. 사진 마감은 오전 9시로 유지하며 알림 시각과 구분합니다.</Text>
          <TextInput accessibilityLabel="알림 시" editable={!busy} keyboardType="number-pad" maxLength={2} value={hour} onChangeText={setHour} style={styles.input}/>
          <TextInput accessibilityLabel="알림 분" editable={!busy} keyboardType="number-pad" maxLength={2} value={minute} onChangeText={setMinute} style={styles.input}/>
          <Text>{reminder?.enabled?'설정 있음':'꺼짐'} · {reminder?.permitted?'허용':'권한 확인 필요'} · {reminder?.precision}</Text>
          <Action title="권한 확인 후 알림 켜기/변경" disabled={busy} onPress={()=>{void run(async()=>{if(!/^\d{1,2}$/.test(hour)||!/^\d{1,2}$/.test(minute))throw new Error('INVALID_TIME');setReminder(await configureReminder(true,Number(hour),Number(minute)));});}}/>
          <Action title="알림 끄기" disabled={busy} onPress={()=>{void run(async()=>{setReminder(await configureReminder(false,9,0));setPending(null);});}}/>
          <Action title="약 10초 뒤 시험 알림" disabled={busy||!reminder?.permitted} onPress={()=>{void run(()=>platformBridge().testReminder());}}/>
        </Panel>
        <Panel title="보존·용량 관리">
          <Text style={styles.text}>사진 사본 {Math.ceil(bytes/1048576)} MB / 최대 500 MB. 닫힌 날짜의 완료/폐기 사본과 사용이 끝난 공유 캐시는 7일 후 앱 재개 때 정리합니다. 미공유/미확인은 자동 삭제하지 않습니다.</Text>
          <Action title="안전한 만료 사본 정리" disabled={busy} onPress={()=>{void run(async()=>{const n=await collectExpired();await refresh(false);setNotice(`${n}개 만료 사본을 정리했습니다. 원본과 미확인 공유는 보존합니다.`);});}}/>
          <Action title="앱의 로컬 사진·이력·설정 전체 삭제" disabled={busy} onPress={()=>confirm('로컬 데이터 초기화','알림과 소스 연결을 끄고 앱 사진 사본·문구·이력을 삭제합니다. 원본과 이미 SNS에 게시한 글은 삭제하지 않습니다. 되돌릴 수 없으며 재설치와 같이 중복 판단 이력이 사라집니다. 미확인 공유는 먼저 확인해야 합니다.',async()=>{await resetLocalData();initialized.current=false;dirty.current=false;setFixtures([]);await refresh();setNotice('앱 로컬 데이터를 삭제했습니다. 휴대폰 원본은 변경하지 않았습니다.');},true)}/>
        </Panel>
        <Panel title="API 키 등록 불필요"><Text style={styles.text}>OS 공유 API만 사용합니다. 외부 서버·Storage·OAuth·앱 로그인은 없습니다. 공식 SNS 앱에서 로그인하고 최종 게시합니다. 빌드 성공과 실기·SNS·IVA 검증은 별개이며 후자는 아직 미실행입니다.</Text></Panel>
      </>}
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f4f7fa', paddingTop: Platform.OS === 'android' ? 32 : 0 },
  header: { padding: 20 }, brand: { fontSize: 27, fontWeight: '700', color: '#162536' },
  sub: { marginTop: 7, color: '#475569', fontSize: 12 }, tabs: { flexDirection: 'row', paddingHorizontal: 12 },
  tab: { flex: 1, paddingVertical: 13, alignItems: 'center', borderRadius: 10 }, selected: { backgroundColor: '#d9eee9' },
  body: { padding: 16, paddingBottom: 60, gap: 16 }, panel: { backgroundColor: '#fff', borderRadius: 16, padding: 18, gap: 12 },
  heading: { fontSize: 18, fontWeight: '600', color: '#172b40' }, text: { fontSize: 14, lineHeight: 23, color: '#334155' },
  notice: { backgroundColor: '#e8edf6', borderRadius: 12, padding: 14, lineHeight: 22 }, warn: { color: '#8a4e0c', lineHeight: 22 },
  button: { backgroundColor: '#155e54', paddingVertical: 13, paddingHorizontal: 16, borderRadius: 10 }, buttonText: { color: '#fff', textAlign: 'center', fontWeight: '600' },
  disabled: { opacity: 0.45 }, input: { minHeight: 100, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 12, textAlignVertical: 'top' },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, photo: { width: 82, height: 82, borderRadius: 8 },
  history: { borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 16, gap: 10 },
});
