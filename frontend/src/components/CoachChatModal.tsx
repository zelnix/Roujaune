import React from "react";
import {
  View, Text, StyleSheet, Modal, Pressable, ScrollView, TextInput,
  ActivityIndicator, Platform, KeyboardAvoidingView,
} from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { C } from "./plan";
import { CoachPersona, useCoachStyle } from "../lib/coach-persona";
import { ChatMessage, fetchChatHistory, sendChatMessage, clearChatHistory, CHAT_SUGGESTIONS, fetchLatestRide, LatestRide } from "../lib/coach-chat";
import { notifyPlanChanged, undoReschedule } from "../lib/plan";
import { setCoachStyle, CoachStyle } from "../lib/coach-persona";
import { useCoachSpeech } from "../hooks/useCoachSpeech";

function TypingDots() {
  return (
    <View style={s.typing}>
      {[0, 1, 2].map((i) => <View key={i} style={s.typingDot} />)}
    </View>
  );
}

export function CoachChatModal({ visible, onClose, persona, onPlanUpdated, seedMessage, onCreatePlan }: { visible: boolean; onClose: () => void; persona: CoachPersona; onPlanUpdated?: (info: { message: string; canUndo: boolean }) => void; seedMessage?: string; onCreatePlan?: () => void }) {
  const style = useCoachStyle();
  const { speak, stop, speakingId } = useCoachSpeech(persona.id);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [latestRide, setLatestRide] = React.useState<LatestRide | null>(null);
  const [planNotice, setPlanNotice] = React.useState<string | null>(null);
  const [canUndo, setCanUndo] = React.useState(false);
  const scrollRef = React.useRef<ScrollView>(null);

  const scrollToEnd = React.useCallback(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, []);

  // Load history whenever the modal opens (or coach changes).
  React.useEffect(() => {
    if (!visible) { stop(); return; }
    let alive = true;
    setLoading(true);
    setPlanNotice(null);
    if (seedMessage) setInput(seedMessage);
    fetchLatestRide().then((r) => { if (alive) setLatestRide(r); });
    fetchChatHistory(persona.name)
      .then((m) => { if (alive) { setMessages(m); scrollToEnd(); } })
      .catch(() => { if (alive) setMessages([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [visible, persona.name, stop, scrollToEnd, seedMessage]);

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || sending) return;
    setInput("");
    const optimistic: ChatMessage = { id: `local-${Date.now()}`, role: "user", text: msg, at: new Date().toISOString() };
    setMessages((m) => [...m, optimistic]);
    setSending(true);
    scrollToEnd();
    try {
      const res = await sendChatMessage(persona, style, msg);
      setMessages((m) => [...m.filter((x) => x.id !== optimistic.id), res.user_message, res.coach_message]);
      if (res.plan_updated) {
        setPlanNotice(res.plan_change || "Your plan was updated");
        setCanUndo(!!res.can_undo);
        if (res.coaching_style) setCoachStyle(res.coaching_style as CoachStyle);
        notifyPlanChanged();
        onPlanUpdated?.({ message: res.plan_change || "Your plan was updated", canUndo: !!res.can_undo });
      }
    } catch {
      setMessages((m) => [...m, { id: `err-${Date.now()}`, role: "coach", text: "I couldn't reach you just now — give me a moment and try again.", at: new Date().toISOString() }]);
    } finally {
      setSending(false);
      scrollToEnd();
    }
  };

  const clear = async () => {
    stop();
    setMessages([]);
    try { await clearChatHistory(persona.name); } catch { /* noop */ }
  };

  const empty = !loading && messages.length === 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.backdrop}>
        <Pressable style={StyleSheet.absoluteFill as any} onPress={onClose} accessibilityLabel="Close chat" />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.center}>
          <View style={s.sheet}>
            {/* header */}
            <View style={s.head}>
              <Image source={persona.image} style={s.headAvatar} contentFit="cover" contentPosition="top center" />
              <View style={{ flex: 1 }}>
                <Text style={s.headName}>{persona.name}</Text>
                <View style={s.headStatus}>
                  <View style={s.onlineDot} />
                  <Text style={s.headRole}>{persona.name} Intelligence · Online</Text>
                </View>
              </View>
              {messages.length > 0 ? (
                <Pressable testID="chat-clear" onPress={clear} hitSlop={8} style={({ hovered }: any) => [s.headBtn, hovered && s.headBtnHover]} accessibilityLabel="Clear conversation">
                  <Ionicons name="trash-outline" size={18} color={C.dim} />
                </Pressable>
              ) : null}
              <Pressable testID="chat-close" onPress={onClose} hitSlop={8} style={({ hovered }: any) => [s.headBtn, hovered && s.headBtnHover]} accessibilityLabel="Close">
                <Ionicons name="close" size={20} color={C.white} />
              </Pressable>
            </View>

            {onCreatePlan ? (
              <Pressable testID="chat-create-plan" onPress={onCreatePlan} style={s.createPlanBtn} accessibilityRole="button" accessibilityLabel="Build a new training plan">
                <Ionicons name="sparkles" size={15} color="#050506" />
                <Text style={s.createPlanText}>Build me a training plan</Text>
              </Pressable>
            ) : null}

            {planNotice ? (
              <View style={s.planNotice} testID="chat-plan-notice">
                <Ionicons name="checkmark-circle" size={15} color={C.green} />
                <Text style={s.planNoticeText} numberOfLines={2}>Plan updated · {planNotice}</Text>
                {canUndo ? (
                  <Pressable
                    testID="chat-plan-undo"
                    onPress={async () => {
                      const ok = await undoReschedule();
                      if (ok) { setPlanNotice("Reverted to your previous schedule"); setCanUndo(false); }
                    }}
                    style={s.undoBtn}
                  >
                    <Ionicons name="arrow-undo" size={13} color={C.white} />
                    <Text style={s.undoText}>Undo</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {/* messages */}
            <ScrollView
              ref={scrollRef}
              style={s.list}
              contentContainerStyle={s.listContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={scrollToEnd}
            >
              {loading ? (
                <View style={s.loadingWrap}><ActivityIndicator color={C.yellow} /></View>
              ) : empty ? (
                <View style={s.emptyWrap}>
                  <Image source={persona.image} style={s.emptyAvatar} contentFit="cover" contentPosition="top center" />
                  <Text style={s.emptyHi}>Ciao, I&apos;m {persona.name}.</Text>
                  <Text style={s.emptySub}>Ask me about your training, a workout, recovery, FB50 strength, or how you&apos;re feeling today.</Text>
                  {latestRide ? (
                    <Pressable
                      testID="chat-latest-ride"
                      onPress={() => send(`Can you review my ${latestRide.routeName || latestRide.workout} ride?`)}
                      style={({ hovered }: any) => [s.latestChip, hovered && s.latestChipHover]}
                    >
                      <Ionicons name="bicycle" size={15} color={C.yellow} />
                      <Text style={s.latestText}>Review my {latestRide.routeName || latestRide.workout} ride</Text>
                      <Ionicons name="chevron-forward" size={14} color={C.yellow} />
                    </Pressable>
                  ) : null}
                  <View style={s.suggestWrap}>
                    {CHAT_SUGGESTIONS.map((q) => (
                      <Pressable key={q} testID="chat-suggestion" onPress={() => send(q)} style={({ hovered }: any) => [s.suggestChip, hovered && s.suggestChipHover]}>
                        <Text style={s.suggestText}>{q}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : (
                messages.map((m) => (
                  m.role === "user" ? (
                    <View key={m.id} style={s.userRow}>
                      <View style={s.userBubble}><Text style={s.userText}>{m.text}</Text></View>
                    </View>
                  ) : (
                    <View key={m.id} style={s.coachRow}>
                      <Image source={persona.image} style={s.coachAvatar} contentFit="cover" contentPosition="top center" />
                      <View style={s.coachBubble}>
                        <Text style={s.coachText}>{m.text}</Text>
                        <Pressable testID="chat-speak" onPress={() => speak(m.id, m.text)} hitSlop={8} style={s.speakBtn} accessibilityLabel={speakingId === m.id ? "Stop" : `Hear ${persona.name}`}>
                          <Ionicons name={speakingId === m.id ? "stop-circle" : "volume-medium-outline"} size={15} color={speakingId === m.id ? C.yellow : C.dim} />
                          <Text style={[s.speakText, speakingId === m.id && { color: C.yellow }]}>{speakingId === m.id ? "Stop" : "Play"}</Text>
                        </Pressable>
                      </View>
                    </View>
                  )
                ))
              )}
              {sending ? (
                <View style={s.coachRow}>
                  <Image source={persona.image} style={s.coachAvatar} contentFit="cover" contentPosition="top center" />
                  <View style={[s.coachBubble, { paddingVertical: 14 }]}><TypingDots /></View>
                </View>
              ) : null}
            </ScrollView>

            {/* input */}
            <View style={s.inputBar}>
              <TextInput
                testID="chat-input"
                value={input}
                onChangeText={setInput}
                placeholder={`Message ${persona.name}…`}
                placeholderTextColor={C.dim}
                style={s.input}
                multiline
                onSubmitEditing={() => send(input)}
                returnKeyType="send"
                blurOnSubmit
              />
              <Pressable testID="chat-send" onPress={() => send(input)} disabled={!input.trim() || sending}
                style={({ hovered }: any) => [s.sendBtn, (!input.trim() || sending) && { opacity: 0.4 }, hovered && input.trim() && { opacity: 0.9 }]}
                accessibilityLabel="Send message">
                <Ionicons name="arrow-up" size={20} color="#241B00" />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(2,3,3,0.74)" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  sheet: { width: "100%", maxWidth: 560, height: "92%", maxHeight: 720, backgroundColor: C.card, borderRadius: 22, borderWidth: 1, borderColor: C.border, overflow: "hidden" },

  head: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: C.borderSoft, backgroundColor: C.cardHi },
  headAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.08)" },
  headName: { color: C.white, fontSize: 16, fontWeight: "800" },
  headStatus: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.green },
  headRole: { color: C.dim, fontSize: 11.5 },
  headBtn: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  headBtnHover: { backgroundColor: "rgba(255,255,255,0.08)" },
  planNotice: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: "rgba(85,200,80,0.1)", borderBottomWidth: 1, borderBottomColor: C.borderSoft },
  createPlanBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, margin: 12, paddingVertical: 11, borderRadius: 12, backgroundColor: C.yellow },
  createPlanText: { color: "#050506", fontSize: 14, fontWeight: "800" },
  planNoticeText: { flex: 1, color: C.green, fontSize: 12.5, fontWeight: "700" },
  undoBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: C.border },
  undoText: { color: C.white, fontSize: 12, fontWeight: "800" },

  list: { flex: 1 },
  listContent: { padding: 16, gap: 12 },
  loadingWrap: { paddingVertical: 40, alignItems: "center" },

  emptyWrap: { alignItems: "center", paddingVertical: 24, paddingHorizontal: 12, gap: 10 },
  emptyAvatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(255,255,255,0.08)", marginBottom: 4 },
  emptyHi: { color: C.white, fontSize: 19, fontWeight: "800" },
  emptySub: { color: C.dim, fontSize: 13.5, textAlign: "center", lineHeight: 20, maxWidth: 360 },
  latestChip: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, borderWidth: 1, borderColor: "rgba(255,194,10,0.4)", borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: "rgba(255,194,10,0.08)" },
  latestChipHover: { backgroundColor: "rgba(255,194,10,0.14)" },
  latestText: { color: C.yellow, fontSize: 13, fontWeight: "700" },
  suggestWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 10 },
  suggestChip: { borderWidth: 1, borderColor: C.border, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 14, backgroundColor: "rgba(255,255,255,0.03)" },
  suggestChipHover: { borderColor: "rgba(255,255,255,0.28)", backgroundColor: "rgba(255,255,255,0.06)" },
  suggestText: { color: C.white, fontSize: 12.5, fontWeight: "600" },

  userRow: { alignItems: "flex-end" },
  userBubble: { maxWidth: "82%", backgroundColor: C.rouge, borderRadius: 16, borderTopRightRadius: 4, paddingVertical: 10, paddingHorizontal: 14 },
  userText: { color: "#fff", fontSize: 14, lineHeight: 20 },

  coachRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, maxWidth: "90%" },
  coachAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.08)" },
  coachBubble: { flex: 1, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: C.borderSoft, borderRadius: 16, borderBottomLeftRadius: 4, paddingVertical: 10, paddingHorizontal: 14 },
  coachText: { color: C.white, fontSize: 14, lineHeight: 21 },
  speakBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8, alignSelf: "flex-start" },
  speakText: { color: C.dim, fontSize: 11, fontWeight: "600" },

  typing: { flexDirection: "row", gap: 5 },
  typingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.dim, opacity: 0.7 },

  inputBar: { flexDirection: "row", alignItems: "flex-end", gap: 10, padding: 12, borderTopWidth: 1, borderTopColor: C.borderSoft, backgroundColor: C.cardHi },
  input: { flex: 1, color: C.white, fontSize: 14, maxHeight: 120, minHeight: 44, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: C.border },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.yellow, alignItems: "center", justifyContent: "center" },
});
