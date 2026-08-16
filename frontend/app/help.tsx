import React from "react";
import { View, Text, StyleSheet, Pressable, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { AppScaffold, Card, SectionTitle } from "@/src/components/app-scaffold";
import { CC } from "@/src/components/calendar";
import { useCoach } from "@/src/lib/coach-persona";

const GETTING_STARTED = [
  { icon: "person-circle-outline", title: "Pick your companion coach", body: "Choose Alberto or Adriana in Settings — they guide every ride." },
  { icon: "bicycle-outline", title: "Choose a workout", body: "Browse the Workouts catalog, open a session and tap Start Workout." },
  { icon: "calendar-outline", title: "Plan your week", body: "Add sessions to the Calendar and follow your adaptive training plan." },
  { icon: "pulse-outline", title: "Ride with live coaching", body: "Get real-time audio cues, then a post-ride debrief from your coach." },
];

const FAQ = [
  { q: "How do I switch between Alberto and Adriana?", a: "Open Settings → Your Companion Coach and select your preferred coach. Everything — voice, portrait and guidance — updates instantly while your history is preserved." },
  { q: "Why can't I hear my coach's voice in the preview?", a: "Spoken coaching uses your device's voices, which aren't available in the web preview. Open the app in Expo Go or an installed build to hear Alberto or Adriana." },
  { q: "How is my training plan adapted?", a: "After each ride your coach reviews your effort and adjusts upcoming sessions. See the changes under Training Plan → View All Adaptations." },
  { q: "What is FB50?", a: "Fit Beyond 50 — cyclist-focused strength, mobility and activation sessions your coach recommends to keep you strong and injury-free." },
  { q: "Can I connect a smart trainer or heart-rate monitor?", a: "Device connections live under the Connections screen. Full Bluetooth pairing is available in installed builds." },
];

function Row({ icon, title, body, color = CC.yellow }: { icon: any; title: string; body: string; color?: string }) {
  return (
    <View style={s.row}>
      <View style={[s.rowIcon, { borderColor: `${color}66`, backgroundColor: `${color}1A` }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.rowTitle}>{title}</Text>
        <Text style={s.rowBody}>{body}</Text>
      </View>
    </View>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Pressable testID={`faq-${q.slice(0, 12)}`} onPress={() => setOpen((v) => !v)} style={s.faq}>
      <View style={s.faqHead}>
        <Text style={s.faqQ}>{q}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={CC.dim} />
      </View>
      {open ? <Text style={s.faqA}>{a}</Text> : null}
    </Pressable>
  );
}

export default function HelpScreen() {
  const router = useRouter();
  const persona = useCoach();
  return (
    <AppScaffold active="help" title="Help & Support" subtitle="Everything you need to get the most from Roujaune.">
      <View style={s.grid}>
        <View style={s.colMain}>
          <Card testID="getting-started">
            <SectionTitle label="GETTING STARTED" color={CC.yellow} />
            <View style={{ gap: 14 }}>
              {GETTING_STARTED.map((g) => <Row key={g.title} {...g} />)}
            </View>
          </Card>

          <Card testID="faq">
            <SectionTitle label="FREQUENTLY ASKED" color={CC.yellow} />
            <View style={{ gap: 8 }}>
              {FAQ.map((f) => <Faq key={f.q} {...f} />)}
            </View>
          </Card>
        </View>

        <View style={s.colSide}>
          <Card testID="ask-coach-help">
            <SectionTitle label={`ASK ${persona.name.toUpperCase()}`} color={CC.rouge} />
            <Text style={s.sideBody}>Your companion coach can answer training questions any time.</Text>
            <Pressable testID="help-message-coach" onPress={() => router.push("/plan")}
              style={({ hovered }: any) => [s.primaryBtn, hovered && { opacity: 0.9 }]}>
              <Ionicons name="chatbubble-ellipses" size={16} color="#241B00" />
              <Text style={s.primaryText}>Message {persona.name}</Text>
            </Pressable>
          </Card>

          <Card testID="contact">
            <SectionTitle label="CONTACT SUPPORT" color={CC.rouge} />
            <Pressable testID="contact-email" onPress={() => Linking.openURL("mailto:support@harmonywellnessgroup.com.au").catch(() => {})} style={s.contactRow}>
              <Ionicons name="mail-outline" size={17} color={CC.white} />
              <Text style={s.contactText}>support@harmonywellnessgroup.com.au</Text>
            </Pressable>
            <View style={s.divider} />
            <View style={s.contactRow}>
              <Ionicons name="shield-checkmark-outline" size={17} color={CC.dim} />
              <Text style={[s.contactText, { color: CC.dim }]}>Roujaune · Harmony Wellness Group</Text>
            </View>
          </Card>
        </View>
      </View>
    </AppScaffold>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: "row", gap: 16, flexWrap: "wrap" },
  colMain: { flex: 1, minWidth: 340, gap: 16 },
  colSide: { width: 320, gap: 16 },
  row: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
  rowIcon: { width: 40, height: 40, borderRadius: 11, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  rowTitle: { color: CC.white, fontSize: 15, fontWeight: "700" },
  rowBody: { color: CC.dim, fontSize: 13, lineHeight: 18, marginTop: 3 },
  faq: { borderWidth: 1, borderColor: CC.borderSoft, borderRadius: 12, padding: 14, backgroundColor: "rgba(255,255,255,0.02)" },
  faqHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  faqQ: { color: CC.white, fontSize: 14, fontWeight: "700", flex: 1 },
  faqA: { color: CC.dim, fontSize: 13, lineHeight: 19, marginTop: 10 },
  sideBody: { color: CC.dim, fontSize: 13, lineHeight: 18, marginBottom: 12 },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: CC.yellow, borderRadius: 12, paddingVertical: 12, minHeight: 46 },
  primaryText: { color: "#241B00", fontSize: 13.5, fontWeight: "800" },
  contactRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  contactText: { color: CC.white, fontSize: 13.5, fontWeight: "600" },
  divider: { height: 1, backgroundColor: CC.borderSoft, marginVertical: 12 },
});
