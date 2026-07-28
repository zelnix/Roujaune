import React from "react";
import { View, Text, StyleSheet, Modal, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { CC } from "./calendar";
import type { BenchmarkNudge } from "../lib/benchmark/api";
import { useLiveNotifications, useNotificationReadState, LiveNotif } from "../lib/notifications";

/** Notifications sheet — driven entirely by real backend signals (re-benchmark,
 * FTP review, upcoming test, missed workouts, coach messages). Read-state is
 * persisted per rider so the bell badge stays accurate across launches. */
export function NotificationsModal({ visible, onClose, nudge }: { visible: boolean; onClose: () => void; nudge?: BenchmarkNudge }) {
  const router = useRouter();
  const notifs = useLiveNotifications(nudge);
  const { readKeys, markRead, markUnread, markAllRead } = useNotificationReadState();
  const [selected, setSelected] = React.useState<LiveNotif | null>(null);

  const openDetail = (n: LiveNotif) => { markRead(n.key); setSelected(n); };
  const close = () => { setSelected(null); onClose(); };
  const goBenchmark = () => { close(); router.push("/benchmark"); };
  const unread = notifs.filter((n) => !readKeys.has(n.key)).length;
  const allRead = () => markAllRead(notifs.map((n) => n.key));

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
              {selected.action === "benchmark" ? (
                <Pressable testID="notif-start-benchmark" onPress={goBenchmark} style={s.actionBtn}>
                  <Ionicons name="fitness" size={16} color={CC.bg ?? "#241B00"} />
                  <Text style={s.actionBtnText}>Start benchmark</Text>
                </Pressable>
              ) : (
                <Pressable
                  testID="mark-unread"
                  onPress={() => { markUnread(selected.key); setSelected(null); }}
                  style={s.unreadBtn}
                >
                  <Ionicons name="mail-unread-outline" size={16} color={CC.white} />
                  <Text style={s.unreadBtnText}>Mark as unread</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <>
              <View style={s.head}>
                <View style={{ flex: 1 }}>
                  <Text style={s.title}>Notifications</Text>
                  <Text style={s.sub}>
                    {notifs.length === 0 ? "You're all caught up" : unread > 0 ? `${unread} unread` : "You're all caught up"}
                  </Text>
                </View>
                <Pressable onPress={close} testID="notifications-close" hitSlop={10}><Ionicons name="close" size={22} color={CC.white} /></Pressable>
              </View>
              {unread > 0 && (
                <Pressable testID="mark-all-read" onPress={allRead} style={s.markAllBtn}>
                  <Ionicons name="checkmark-done-outline" size={15} color={CC.yellow} />
                  <Text style={s.markAllText}>Mark all read</Text>
                </Pressable>
              )}
              {notifs.length === 0 ? (
                <View testID="notifications-empty" style={s.empty}>
                  <Ionicons name="notifications-off-outline" size={28} color={CC.dim} />
                  <Text style={s.emptyText}>No new notifications right now.</Text>
                </View>
              ) : (
                <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
                  {notifs.map((n) => {
                    const isRead = readKeys.has(n.key);
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
                            onPress={(e) => { e.stopPropagation(); isRead ? markUnread(n.key) : markRead(n.key); }}
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
              )}
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
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 34, gap: 10 },
  emptyText: { color: CC.dim, fontSize: 13, fontWeight: "600" },
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
  actionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16, borderRadius: 12, paddingVertical: 13, backgroundColor: CC.yellow },
  actionBtnText: { color: CC.bg ?? "#241B00", fontSize: 14, fontWeight: "900" },
  markAllBtn: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6, paddingBottom: 6 },
  markAllText: { color: CC.yellow, fontSize: 12.5, fontWeight: "800" },
});
