import React from "react";
import { View, Text, StyleSheet, Modal, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CC } from "./calendar";

type Notif = { id: string; icon: any; color: string; title: string; body: string; detail: string; time: string };

const NOTIFS: Notif[] = [
  { id: "1", icon: "trophy", color: CC.yellow, title: "New personal best", body: "You set a new 20-min power record on your last ride.", detail: "Outstanding work! On your last ride you held 298 W for 20 minutes — a new personal best and a strong sign your threshold is climbing. Your coach has already factored this into your upcoming interval targets. Keep fuelling well and recovering between hard sessions.", time: "2h ago" },
  { id: "2", icon: "calendar", color: CC.rouge, title: "Tomorrow: Threshold intervals", body: "4 × 8 min at threshold — get an early night.", detail: "Tomorrow's session is 4 × 8 minutes at threshold with 4 minutes easy between efforts. Aim to hold steady power rather than starting too hard. Have a good dinner tonight, hydrate, and get an early night so you arrive fresh.", time: "5h ago" },
  { id: "3", icon: "flame", color: "#E8631C", title: "Streak going strong", body: "Keep the momentum — ride today to extend your streak.", detail: "You're on a roll! Consistency is the single biggest driver of fitness gains. A short spin today is enough to keep your streak alive — even 30 easy minutes counts.", time: "1d ago" },
  { id: "4", icon: "chatbubble-ellipses", color: CC.green, title: "Message from your coach", body: "\"Great work holding your zones this week.\"", detail: "\"Great work holding your zones this week — your pacing on the climbs was much more even than last block. Next we'll sharpen your top end with a couple of VO2 sessions. Proud of the discipline you're showing.\"", time: "2d ago" },
];

/** Notifications sheet — tap a notification to read the detail (marks it read),
 * with per-row read/unread toggles and an unread count. */
export function NotificationsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [readIds, setReadIds] = React.useState<Set<string>>(new Set());
  const [selected, setSelected] = React.useState<Notif | null>(null);

  const markRead = (id: string) => setReadIds((prev) => new Set(prev).add(id));
  const toggleRead = (id: string) =>
    setReadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const openDetail = (n: Notif) => { markRead(n.id); setSelected(n); };
  const close = () => { setSelected(null); onClose(); };
  const unread = NOTIFS.filter((n) => !readIds.has(n.id)).length;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={s.backdrop} onPress={close} testID="notifications-modal">
        <Pressable style={s.card} onPress={() => { /* swallow */ }}>
          {selected ? (
            <View testID="notification-detail">
              <View style={s.head}>
                <Pressable onPress={() => setSelected(null)} testID="notification-back" hitSlop={10} style={s.backBtn}>
                  <Ionicons name="chevron-back" size={20} color={CC.white} />
                </Pressable>
                <View style={[s.detailIcon, { backgroundColor: selected.color + "22", borderColor: selected.color }]}>
                  <Ionicons name={selected.icon} size={18} color={selected.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.title}>{selected.title}</Text>
                  <Text style={s.sub}>{selected.time}</Text>
                </View>
              </View>
              <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
                <Text style={s.detailBody}>{selected.detail}</Text>
              </ScrollView>
              <Pressable
                testID="mark-unread"
                onPress={() => { toggleRead(selected.id); setSelected(null); }}
                style={s.unreadBtn}
              >
                <Ionicons name="mail-unread-outline" size={16} color={CC.white} />
                <Text style={s.unreadBtnText}>Mark as unread</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={s.head}>
                <View style={{ flex: 1 }}>
                  <Text style={s.title}>Notifications</Text>
                  <Text style={s.sub}>{unread > 0 ? `${unread} unread` : "You're all caught up"}</Text>
                </View>
                <Pressable onPress={close} testID="notifications-close" hitSlop={10}><Ionicons name="close" size={22} color={CC.white} /></Pressable>
              </View>
              <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
                {NOTIFS.map((n) => {
                  const isRead = readIds.has(n.id);
                  return (
                    <Pressable key={n.id} testID={`notification-${n.id}`} onPress={() => openDetail(n)} style={s.row}>
                      {!isRead ? <View style={s.unreadDot} /> : <View style={s.dotSpacer} />}
                      <View style={[s.icon, { backgroundColor: n.color + "22", borderColor: n.color }]}>
                        <Ionicons name={n.icon} size={17} color={n.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.rowTitle, isRead && s.readText]}>{n.title}</Text>
                        <Text style={s.rowBody} numberOfLines={2}>{n.body}</Text>
                      </View>
                      <View style={s.rowRight}>
                        <Text style={s.time}>{n.time}</Text>
                        <Pressable
                          testID={`toggle-read-${n.id}`}
                          onPress={(e) => { e.stopPropagation(); toggleRead(n.id); }}
                          hitSlop={8}
                          style={s.toggleBtn}
                          accessibilityLabel={isRead ? "Mark as unread" : "Mark as read"}
                        >
                          <Ionicons name={isRead ? "mail-unread-outline" : "checkmark-done"} size={15} color={CC.dim} />
                        </Pressable>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 440, backgroundColor: CC.card, borderWidth: 1, borderColor: CC.border, borderRadius: 20, padding: 20 },
  head: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  backBtn: { padding: 2 },
  title: { color: CC.white, fontSize: 19, fontWeight: "900" },
  sub: { color: CC.dim, fontSize: 12.5, marginTop: 2 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 11, borderTopWidth: 1, borderTopColor: CC.borderSoft },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: CC.rouge, marginTop: 6 },
  dotSpacer: { width: 8 },
  icon: { width: 38, height: 38, borderRadius: 11, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  detailIcon: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  rowTitle: { color: CC.white, fontSize: 14, fontWeight: "800" },
  readText: { color: CC.dim, fontWeight: "600" },
  rowBody: { color: CC.dim, fontSize: 12.5, marginTop: 2, lineHeight: 17 },
  rowRight: { alignItems: "flex-end", gap: 8 },
  time: { color: CC.dim, fontSize: 11, fontWeight: "600" },
  toggleBtn: { padding: 4 },
  detailBody: { color: CC.white, fontSize: 14, lineHeight: 21 },
  unreadBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16, borderWidth: 1, borderColor: CC.border, borderRadius: 12, paddingVertical: 12, backgroundColor: "rgba(255,255,255,0.03)" },
  unreadBtnText: { color: CC.white, fontSize: 13, fontWeight: "700" },
});
