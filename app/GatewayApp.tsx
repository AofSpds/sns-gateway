import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Image, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { platformBridge, type Fixture, type ReminderStatus } from '../modules/local-platform';
import { providers, type ProviderId } from '../src/gateway/providers';
import { dayWindow, selectToday } from '../src/domain/planning';
import { movePhoto } from '../src/domain/inbox';
import { labels } from '../src/domain/sharing';
import { listHistory, markUserOutcome, type HistoryRow } from '../src/storage/history';
import { listAssets, registerPhotos, loadCaption, saveCaption, type AssetRow } from '../src/storage/inbox';
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
export default function GatewayApp() {
  const [tab, setTab] = useState<Tab>('오늘');
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [caption, setCaption] = useState('오늘의 기록입니다.');
  const [provider, setProvider] = useState<ProviderId>('instagram');
  const currentProvider = useRef<ProviderId>('instagram');
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [reminder, setReminder] = useState<ReminderStatus | null>(null);
  const [hour, setHour] = useState('9'); const [minute, setMinute] = useState('0');
  const [notice, setNotice] = useState('개발 후보입니다. 기기/SNS 호환성은 아직 시험하지 않았습니다.');
  const [busy, setBusy] = useState(false); const lock = useRef(false);
  const [today, setToday] = useState(dayWindow(Date.now()));
  async function refresh() {
    setToday(dayWindow(Date.now()));
    setAssets(await listAssets(currentProvider.current)); setHistory(await listHistory());
    setReminder(await platformBridge().reminderStatus());
  }
  useEffect(() => {
    let mounted = true;
    (async () => {
      // Orphan copies are not silently assigned an invented registration time.
      await registerPhotos(await platformBridge().inventoryPhotos(), true);
      const [rows, saved, h, alarm] = await Promise.all([listAssets(provider), loadCaption(), listHistory(), platformBridge().reminderStatus()]);
      if (mounted) { setAssets(rows); setCaption(saved); setHistory(h); setReminder(alarm); setHour(String(alarm.hour)); setMinute(String(alarm.minute)); }
    })().catch(() => { if (mounted) setNotice('초기화를 완료하지 못했습니다. native 빌드와 로컬 저장소를 확인하세요. 기존 데이터를 삭제하지 않습니다.'); });
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active' && !lock.current) { setTab('오늘'); void refresh().catch(() => setNotice('앱 재개 후 상태 조회 실패: 이전 정보를 완료로 간주하지 마세요.')); }
    });
    return () => { mounted = false; listener.remove(); };
    // These startup and resume operations do not initiate sharing or enable alarms.
  }, []);
  async function run(operation: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try { await operation(); }
    catch { setNotice('완료를 확인하지 못했습니다. 권한·로컬 파일·이력을 확인하세요. 자동 재공유나 데이터 삭제는 하지 않습니다.'); }
    finally { lock.current = false; setBusy(false); }
  }
  function autoSelect() {
    const result = selectToday(assets.map(a => ({ id: a.id, registeredAt: a.registered_at, timestampBasis: a.basis, state: 'READY', alreadyShared: !!a.already_shared })), Date.now());
    if (result.requiresSelection) { setSelected([]); setNotice('오늘 대상이 10장을 넘습니다. 사진함에서 직접 고르세요.'); }
    else { setSelected(result.eligible.map(a => a.id)); setNotice(`오늘 오전 9시 이전 등록분 ${result.eligible.length}장을 선택했습니다. 날짜 불명확/이전 공유 시도는 제외했습니다.`); }
    setTab('사진');
  }
  function requestShare(synthetic = false) {
    const ids = [...selected];
    const paths = synthetic ? fixtures.map(f => f.uri) : ids.map(id => assets.find(a => a.id === id)?.uri ?? '');
    if (!paths.length) return;
    Alert.alert('사진과 공개 범위 확인', 'OS 공유 메뉴에서 SNS와 계정을 직접 선택하세요. 수신 SNS 앱은 게시 전에도 업로드할 수 있습니다. Gateway는 실제 게시 성공을 확인하지 못합니다.', [
      { text: '취소', style: 'cancel' },
      { text: '공유 메뉴 열기', onPress: () => { void run(async () => {
        await shareFixtures(provider, paths, caption, synthetic ? undefined : ids);
        await refresh(); setSelected([]); setNotice('공유 시도를 기록했습니다. 게시 여부는 미확인입니다. 이력에서 직접 표시할 수 있습니다.');
      }); } },
    ]);
  }
  return <SafeAreaView style={styles.safe}>
    <View style={styles.header}><Text style={styles.brand}>SNS Gateway</Text><Text style={styles.sub}>기기 내부 · API 키 없음 · 최종 게시 수동</Text></View>
    <View style={styles.tabs}>{tabs.map(item => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: tab === item }} onPress={() => setTab(item)} style={[styles.tab, tab === item && styles.selected]}><Text>{item}</Text></Pressable>)}</View>
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text>
      {tab === '오늘' && <>
        <Panel title="오늘의 사진 준비">
          <Text style={styles.text}>{today.serviceDate} · 한국 시간 · 00:00 이상 09:00 미만 등록분</Text>
          <Text style={styles.text}>게시함 {assets.length}장. 알림 시각과 사진 날짜창은 별도입니다.</Text>
          <Text style={styles.text}>{reminder?.enabled && reminder.permitted ? '알림 설정 있음' : '알림 꺼짐 또는 권한 확인 필요'}</Text>
          <Text style={styles.text}>다음 OS 예약/요청: {reminder?.nextAt ? new Date(reminder.nextAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '확인되지 않음'}</Text>
          <Text style={styles.warn}>Android 알림은 지연될 수 있습니다. 알림 전달이나 SNS 공개 시각을 보장하지 않습니다.</Text>
          <Action title="오늘 대상 고르기" disabled={busy} onPress={autoSelect} />
          <Action title="상태 새로고침" disabled={busy} onPress={() => { void run(refresh); }} />
        </Panel>
        <Panel title="SNS 희망 대상">
          {providers.map(item => <Action key={item.id} title={`${provider === item.id ? '선택: ' : ''}${item.name} · 실기 미시험`} disabled={busy} onPress={() => { void run(async () => { currentProvider.current = item.id; setProvider(item.id); setAssets(await listAssets(item.id)); setSelected([]); }); }} />)}
          <Text style={styles.text}>계정 인증 기능이 아닙니다. 실제 대상은 OS 공유 메뉴에서 고릅니다.</Text>
        </Panel>
      </>}
      {tab === '사진' && <>
        <Panel title="로컬 게시함">
          <Action title="기기 사진 가져오기 (최대 10장)" disabled={busy} onPress={() => { void run(async () => {
            const result = await platformBridge().pickPhotos(); const added = await registerPhotos(result.photos);
            setAssets(await listAssets(provider)); setSelected([...new Set(result.photos.map(p => p.id))]);
            setNotice(`새 등록 ${added}장 / 가져오지 못한 사진 ${result.skipped}장. 현재 선택은 수동 선택이며 날짜창 밖 사진도 포함할 수 있습니다. 클라우드 원본·권한·용량을 확인하세요.`);
          }); }} />
          <Text style={styles.text}>원본은 변경하지 않습니다. 게시함 사본은 기기에만 저장됩니다. 지정 폴더/앨범 자동 연동과 자동 정리는 아직 없습니다.</Text>
          {assets.map(a => <View key={a.id} style={styles.history}>
            <View style={styles.photos}><Image source={{ uri: a.uri }} accessibilityLabel="게시함 사진" style={styles.photo} /><Text style={styles.text}>{a.basis === 'FIRST_OBSERVED' ? '복구 사본 · 등록 날짜 확인 필요' : new Date(a.registered_at!).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}{a.already_shared ? '\n선택한 SNS로 공유 시도 있음' : ''}</Text></View>
            <Action title={selected.includes(a.id) ? '선택 해제' : '수동으로 포함 (날짜/재공유 확인)'} disabled={busy || (!selected.includes(a.id) && selected.length >= 10)} onPress={() => setSelected(prev => prev.includes(a.id) ? prev.filter(id => id !== a.id) : [...prev, a.id])} />
          </View>)}
          {!assets.length && <Text style={styles.text}>사진을 가져오면 여기에 보입니다.</Text>}
        </Panel>
        <Panel title={`공유 순서 · ${selected.length}장`}>
          {selected.map((id, index) => <View key={id} style={styles.photos}><Text style={styles.text}>{index + 1}번</Text><Image source={{uri: assets.find(a => a.id === id)?.uri}} style={styles.photo} /><Action title="앞으로" disabled={busy || index === 0} onPress={() => setSelected(movePhoto(selected, index, -1))} /><Action title="뒤로" disabled={busy || index === selected.length - 1} onPress={() => setSelected(movePhoto(selected, index, 1))} /></View>)}
          <TextInput accessibilityLabel="게시 문구" editable={!busy} multiline maxLength={2200} value={caption} onChangeText={setCaption} style={styles.input} />
          <Action title="문구 기기에 저장" disabled={busy} onPress={() => { void run(async () => { await saveCaption(caption); setNotice('문구를 기기에 저장했습니다.'); }); }} />
          <Action title="문구 복사" disabled={busy} onPress={() => { void run(async () => { await platformBridge().copyCaption(caption); setNotice('필요하면 SNS 작성 화면에 문구를 직접 붙여넣으세요.'); }); }} />
          <Action title="선택한 사진 공유" disabled={busy || !selected.length} onPress={() => requestShare()} />
        </Panel>
        <Panel title="개인사진 없는 공유 시험">
          <Action title="합성 사진 1장 만들기" disabled={busy} onPress={() => { void run(async () => setFixtures(await platformBridge().makeFixtures(1))); }} />
          <Action title="합성 사진 3장 만들기" disabled={busy} onPress={() => { void run(async () => setFixtures(await platformBridge().makeFixtures(3))); }} />
          <View style={styles.photos}>{fixtures.map(f => <Image key={f.uri} source={{uri:f.uri}} accessibilityLabel={f.label} style={styles.photo} />)}</View>
          <Action title="합성 사진 공유" disabled={busy || !fixtures.length} onPress={() => requestShare(true)} />
        </Panel>
      </>}
      {tab === '이력' && <Panel title="공유 이력 · 원격 게시 확인 아님">
        <Action title="새로고침" disabled={busy} onPress={() => { void run(refresh); }} />
        {!history.length && <Text>공유 기록이 없습니다.</Text>}
        {history.map(row => <View key={row.id} style={styles.history}>
          <Text style={styles.heading}>{row.intended_target} (희망 대상)</Text><Text style={styles.text}>{labels[row.state]}</Text>
          <Text style={styles.text}>관측 대상: {row.observed_target ?? '알 수 없음'} · {row.evidence}</Text>
          <Action title="게시했다고 표시 (사용자 진술)" disabled={busy || row.state === 'REQUESTED'} onPress={() => { void run(async () => { await markUserOutcome(row, true); await refresh(); }); }} />
          <Action title="취소했다고 표시" disabled={busy || row.state === 'REQUESTED'} onPress={() => { void run(async () => { await markUserOutcome(row, false); await refresh(); }); }} />
        </View>)}
      </Panel>}
      {tab === '설정' && <>
        <Panel title="로컬 예약 알림">
          <Text style={styles.text}>한국 시간. 사진 날짜창은 오전 9시로 유지합니다. 입력 시각은 알림만 바꿉니다.</Text>
          <TextInput accessibilityLabel="알림 시" editable={!busy} keyboardType="number-pad" maxLength={2} value={hour} onChangeText={setHour} style={styles.input} />
          <TextInput accessibilityLabel="알림 분" editable={!busy} keyboardType="number-pad" maxLength={2} value={minute} onChangeText={setMinute} style={styles.input} />
          <Text style={styles.text}>{reminder?.enabled ? '예약 설정 있음' : '예약 꺼짐'} · {reminder?.permitted ? '알림 허용' : '알림 권한 확인 필요'} · {reminder?.precision ?? '조회 전'}</Text>
          <Action title="권한 확인 후 알림 켜기/변경" disabled={busy} onPress={() => { void run(async () => { if (!/^\d{1,2}$/.test(hour) || !/^\d{1,2}$/.test(minute)) throw new Error('INVALID_TIME'); setReminder(await configureReminder(true, Number(hour), Number(minute))); }); }} />
          <Action title="알림 끄기" disabled={busy} onPress={() => { void run(async () => setReminder(await configureReminder(false, 9, 0))); }} />
          <Action title="약 10초 뒤 시험 알림" disabled={busy || !reminder?.permitted} onPress={() => { void run(async () => { await platformBridge().testReminder(); setNotice('시험 알림을 요청했습니다. 앱을 배경으로 보내 확인하세요. OS 설정에 따라 늦어질 수 있습니다.'); }); }} />
        </Panel>
        <Panel title="API 키 등록 불필요"><Text style={styles.text}>OS 공유 API를 사용합니다. Meta·Supabase·OpenAI 키나 SNS 비밀번호를 입력하지 않습니다. 공식 SNS 앱에서 로그인합니다.</Text></Panel>
        <Panel title="현재 한계"><Text style={styles.text}>외부 폴더/앨범 자동 연동, 자동 보존 정리, 실제 기기·SNS 호환성·IVA 검증은 완료되지 않았습니다. 앱 삭제 시 로컬 이력이 사라질 수 있습니다. SNS 수신 후 그 앱의 전송은 별개입니다.</Text></Panel>
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
