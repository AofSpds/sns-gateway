import { useEffect, useRef, useState } from 'react';
import { Alert, Image, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { platformBridge, type Fixture } from '../modules/local-platform';
import { providers, type ProviderId } from '../src/gateway/providers';
import { dayWindow, nextReminder } from '../src/domain/planning';
import { labels } from '../src/domain/sharing';
import { listHistory, markUserOutcome, type HistoryRow } from '../src/storage/history';
import { shareFixtures } from '../src/services/share';

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
  const [caption, setCaption] = useState('SNS Gateway 합성사진 공유 시험입니다.');
  const [provider, setProvider] = useState<ProviderId>('instagram');
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [notice, setNotice] = useState('개발 후보입니다. 실제 사진·폴더·9시 알림은 아직 연결하지 않았습니다.');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const today = dayWindow(Date.now());
  const next = new Date(nextReminder(Date.now())).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  useEffect(() => { listHistory().then(setHistory).catch(() => setNotice('로컬 모듈을 포함한 native 빌드가 필요합니다. Expo Go는 지원하지 않습니다.')); }, []);
  async function run(operation: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try { await operation(); }
    catch { setNotice('작업 완료를 확인하지 못했습니다. 자동으로 다시 공유하지 않습니다. 이력과 빌드 상태를 확인하세요.'); }
    finally { lock.current = false; setBusy(false); }
  }
  function requestShare() {
    Alert.alert('합성 사진 공유 시험', '공유 메뉴에서 SNS와 계정을 직접 선택하세요. SNS 앱은 게시 버튼을 누르기 전에도 사진을 전송할 수 있습니다. 실제 게시 여부는 이 앱이 확인하지 못합니다.', [
      { text: '취소', style: 'cancel' },
      { text: '공유 메뉴 열기', onPress: () => { void run(async () => {
        await shareFixtures(provider, fixtures.map(file => file.uri), caption);
        setHistory(await listHistory());
        setNotice('공유 시도를 기록했습니다. 실제 게시 여부와 별개의 기록입니다.');
      }); } },
    ]);
  }
  return <SafeAreaView style={styles.safe}>
    <View style={styles.header}><Text style={styles.brand}>SNS Gateway</Text><Text style={styles.sub}>기기 내부 · API 키 없음 · 합성 사진 시험</Text></View>
    <View style={styles.tabs}>{tabs.map(item => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: tab === item }} onPress={() => setTab(item)} style={[styles.tab, tab === item && styles.selected]}><Text>{item}</Text></Pressable>)}</View>
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text>
      {tab === '오늘' && <>
        <Panel title="첫 구현 묶음 · 공유 시험"><Text style={styles.text}>SG-00 / SG-01 개발 후보입니다. 개인 사진에 접근하지 않고 번호가 적힌 JPEG 시험 이미지를 기기에서 만듭니다.</Text><Text style={styles.text}>기준 날짜: {today.serviceDate} (한국 시간)</Text><Text style={styles.text}>다음 9시 계산: {next}</Text><Text style={styles.warn}>계산만 제공하며 아직 알림을 등록하지 않습니다.</Text><Action title="사진 공유 시험으로 이동" onPress={() => setTab('사진')} /></Panel>
        <Panel title="SNS 기능 상태">{providers.map(item => <Text key={item.id} style={styles.text}>{item.name} · 실기 호환성 미시험 · 계정 인증 기능 없음</Text>)}<Text style={styles.text}>실제 앱 로그인과 최종 게시 버튼은 공식 SNS 앱에서 처리합니다.</Text></Panel>
      </>}
      {tab === '사진' && <>
        <Panel title="합성 JPEG 준비">
          <Action title="시험 사진 1장 만들기" disabled={busy} onPress={() => { void run(async () => { setFixtures(await platformBridge().makeFixtures(1)); setNotice('합성 사진 1장을 기기에 준비했습니다.'); }); }} />
          <Action title="시험 사진 3장 만들기" disabled={busy} onPress={() => { void run(async () => { setFixtures(await platformBridge().makeFixtures(3)); setNotice('합성 사진 3장을 기기에 준비했습니다. 다중 수신은 SNS별 시험 대상입니다.'); }); }} />
          <View style={styles.photos}>{fixtures.map(file => <View key={file.uri}><Image source={{ uri: file.uri }} accessibilityLabel={file.label} style={styles.photo} /><Text>{file.label}</Text></View>)}</View>
        </Panel>
        <Panel title="문구와 공유">
          <TextInput accessibilityLabel="시험 게시 문구" multiline maxLength={2200} value={caption} onChangeText={setCaption} style={styles.input} />
          <Text style={styles.text}>아래 선택은 희망 대상입니다. 실제 SNS는 OS 공유 메뉴에서 선택합니다.</Text>
          {providers.map(item => <Action key={item.id} title={`${provider === item.id ? '선택: ' : ''}${item.name}`} disabled={busy} onPress={() => setProvider(item.id)} />)}
          <Action title="문구 복사 (직접 붙여넣기)" disabled={busy} onPress={() => { void run(async () => { await platformBridge().copyCaption(caption); setNotice('문구를 복사했습니다. 수신 앱이 문구를 받지 않으면 직접 붙여넣으세요.'); }); }} />
          <Action title="합성 사진 공유 시험" disabled={busy || !fixtures.length} onPress={requestShare} />
        </Panel>
      </>}
      {tab === '이력' && <Panel title="공유 시도 이력">
        <Action title="새로고침" disabled={busy} onPress={() => { void run(async () => { setHistory(await listHistory()); }); }} />
        {!history.length && <Text style={styles.text}>아직 기록된 공유 시도가 없습니다.</Text>}
        {history.map(row => <View key={row.id} style={styles.history}>
          <Text style={styles.heading}>{row.intended_target} (희망 대상)</Text><Text style={styles.text}>{labels[row.state]}</Text>
          <Text style={styles.text}>OS 대상: {row.observed_target ?? '알 수 없음'} / 근거: {row.evidence}</Text>
          <Action title="게시했다고 표시 (사용자 진술)" disabled={busy || row.state === 'REQUESTED'} onPress={() => { void run(async () => { await markUserOutcome(row, true); setHistory(await listHistory()); }); }} />
          <Action title="취소했다고 표시" disabled={busy || row.state === 'REQUESTED'} onPress={() => { void run(async () => { await markUserOutcome(row, false); setHistory(await listHistory()); }); }} />
        </View>)}
      </Panel>}
      {tab === '설정' && <>
        <Panel title="API 키 등록 불필요"><Text style={styles.text}>이 후보는 OS 공유 기능만 사용합니다. Meta·Supabase·OpenAI·Anthropic 키나 SNS 비밀번호를 입력하지 마세요.</Text></Panel>
        <Panel title="아직 구현하지 않은 기능"><Text style={styles.text}>실제 사진 가져오기, 지정 폴더/앨범, 9시 로컬 알림, 사진 보존·용량 관리는 다음 구현 범위입니다. 버튼이나 권한이 숨겨진 것이 아닙니다.</Text></Panel>
        <Panel title="개인정보와 시험 범위"><Text style={styles.text}>현재는 합성 이미지와 로컬 이력만 저장합니다. 공유 화면 호출은 원격 게시 성공이 아닙니다. 기기/SNS 시험, IVA, 배포는 미수행입니다.</Text></Panel>
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
