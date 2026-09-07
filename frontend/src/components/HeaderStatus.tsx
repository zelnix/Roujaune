import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { colors, radius } from "../theme";
import { GlassPill } from "./ui";
import { useRiderProfile } from "../lib/rider-profile";
import { useBenchmarkNudge } from "../lib/benchmark/api";
import { useLiveNotifications, useNotificationReadState } from "../lib/notifications";
import { NotificationsModal } from "./NotificationsModal";

function initials(name?: string): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "R";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Standard top-right status cluster used on every screen:
 * notification button + rider avatar. Self-manages the notifications modal
 * and routes the avatar to the Profile screen.
 */
export function HeaderStatus() {
  const router = useRouter();
  const { avatar, profile, loaded } = useRiderProfile();
  const { nudge } = useBenchmarkNudge();
  const notifs = useLiveNotifications(nudge);
  const { readKeys } = useNotificationReadState();
  const unread = notifs.filter((n) => !readKeys.has(n.key)).length;
  const [showNotifs, setShowNotifs] = React.useState(false);
  const initialsText = loaded ? initials(profile?.name) : "";

  return (
    <View style={styles.row}>
      <GlassPill testID="bell-pill" onPress={() => setShowNotifs(true)}>
        <Ionicons name="notifications" size={16} color="#fff" />
        {unread > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unread}</Text>
          </View>
        )}
      </GlassPill>

      <GlassPill testID="profile-pill" style={styles.avatar} onPress={() => router.push("/profile")}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={styles.avatarImg} contentFit="cover" contentPosition="top center" />
        ) : initialsText ? (
          <View style={styles.avatarInitialsWrap}>
            <Text style={styles.avatarInitials}>{initialsText}</Text>
          </View>
        ) : (
          <Ionicons name="person" size={18} color="#fff" />
        )}
      </GlassPill>

      <NotificationsModal visible={showNotifs} onClose={() => setShowNotifs(false)} nudge={nudge} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  badge: { position: "absolute", top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.red, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  avatar: { width: 44, height: 44, paddingHorizontal: 0, borderColor: colors.yellow, borderWidth: 1.5 },
  avatarImg: { width: "100%", height: "100%", borderRadius: radius.pill },
  avatarInitialsWrap: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: "rgba(255,194,10,0.16)" },
  avatarInitials: { color: colors.yellow, fontSize: 15, fontWeight: "800", letterSpacing: 0.5 },
});
