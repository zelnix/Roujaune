import React from "react";
import { View, Text, StyleSheet, Pressable, useWindowDimensions, Modal, TextInput, Alert, Linking, Platform } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";

import { AppScaffold, Card, SectionTitle } from "@/src/components/app-scaffold";
import { CC } from "@/src/components/calendar";
import { ProgressPanel } from "@/src/components/ProgressPanel";
import { useSettings } from "@/src/lib/settings";
import { useCoach } from "@/src/lib/coach-persona";
import { useRiderProfile, useRiderAchievements, RiderProfile } from "@/src/lib/rider-profile";
import { LEVEL_META, CAPABILITY_TO_LEVEL } from "@/src/lib/workout-catalog";

const riderImg = require("../assets/images/hero_cyclist_b2.jpg");

const GENDERS = [
  { id: "male", label: "Male" },
  { id: "female", label: "Female" },
  { id: "other", label: "Other" },
];

const CAPS = [
  { id: "beginner", label: "Beginner" },
  { id: "intermediate", label: "Intermediate" },
  { id: "advanced", label: "Advanced" },
];

function Stat({ v, l, accent }: { v: string; l: string; accent?: string }) {
  return (
    <View style={s.stat}>
      <Text style={[s.statVal, accent ? { color: accent } : null]}>{v}</Text>
      <Text style={s.statLbl}>{l}</Text>
    </View>
  );
}

const ACHIEVEMENTS: { icon: any; label: string; sub: string; color: string }[] = [];

export default function ProfileScreen() {
  const { settings, setSetting } = useSettings();
  const persona = useCoach();
  const { profile, avatar, update, setAvatar } = useRiderProfile();
  const achievements = useRiderAchievements() ?? ACHIEVEMENTS;
  const { width } = useWindowDimensions();
  const twoCol = width >= 900;

  const [editing, setEditing] = React.useState(false);
  const genderLabel = GENDERS.find((g) => g.id === profile.gender)?.label ?? "—";
  const capLabel = CAPS.find((c) => c.id === profile.capability)?.label ?? "Intermediate";
  const capColor = LEVEL_META[CAPABILITY_TO_LEVEL[profile.capability]].color;
  const locationText = [profile.city, profile.region, profile.country].map((p) => p?.trim()).filter(Boolean).join(", ");

  const pickImage = async () => {
    // Contextual permission handling for the photo library.
    let perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      if (perm.canAskAgain) perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Photo access needed",
          "Allow photo access so you can set your rider profile picture.",
          perm.canAskAgain
            ? [{ text: "OK" }]
            : [
                { text: "Not now", style: "cancel" },
                { text: "Open Settings", onPress: () => Linking.openSettings() },
              ],
        );
        return;
      }
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
      base64: true,
    });
    if (!res.canceled && res.assets?.[0]?.base64) {
      setAvatar(`data:image/jpeg;base64,${res.assets[0].base64}`);
    }
  };

  return (
    <AppScaffold active="profile" title="Profile" subtitle="Your rider identity, season progress and achievements.">
      <View style={[s.row, !twoCol && { flexDirection: "column" }]}>
        {/* Rider identity */}
        <Card testID="profile-identity" style={{ flex: 1 }}>
          <View style={s.identityRow}>
            <Pressable testID="avatar-upload" onPress={pickImage} style={s.avatarWrap}>
              <Image source={avatar ? { uri: avatar } : riderImg} style={s.avatar} contentFit="cover" contentPosition="top center" />
              <View style={s.cameraBadge}>
                <Ionicons name="camera" size={14} color="#241B00" />
              </View>
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{profile.name}</Text>
              <Text style={s.org}>Roujaune · Harmony Wellness Group</Text>
              {locationText ? (
                <View style={s.locRow}>
                  <Ionicons name="location" size={13} color={CC.yellow} />
                  <Text style={s.locText}>{locationText}</Text>
                </View>
              ) : null}
              <View style={s.badgeRow}>
                <View style={[s.tierBadge, { backgroundColor: capColor }]}>
                  <Ionicons name="podium-outline" size={11} color="#241B00" />
                  <Text style={s.tierText}>{capLabel}</Text>
                </View>
                <View style={s.coachChip}>
                  <Image source={persona.image} style={s.coachChipImg} contentFit="cover" contentPosition="top center" />
                  <Text style={s.coachChipText}>Coached by {persona.name}</Text>
                </View>
              </View>
            </View>
            <Pressable testID="edit-profile" onPress={() => setEditing(true)} style={({ hovered }: any) => [s.editBtn, hovered && s.hover]}>
              <Ionicons name="create-outline" size={15} color={CC.white} />
              <Text style={s.editText}>Edit</Text>
            </Pressable>
          </View>

          <View style={s.statsRow}>
            <Stat v={`${settings.ftp} W`} l="FTP" accent={CC.yellow} />
            <Stat v={`${Math.round(profile.weight_kg)} kg`} l="Weight" />
            <Stat v={`${(settings.ftp / (profile.weight_kg || 78)).toFixed(1)}`} l="W/kg" />
            <Stat v={`${profile.age}`} l="Age" />
            <Stat v={genderLabel} l="Gender" />
          </View>
          <Text style={s.feedNote}>
            <Ionicons name="sparkles" size={11} color={CC.yellow} /> {persona.name} uses your weight, age and gender to personalise effort, power-to-weight and recovery guidance.
          </Text>
        </Card>

        {/* Progress snapshot (real logged sessions) */}
        <Card testID="profile-season" style={twoCol ? { width: 360 } : undefined}>
          <SectionTitle label="YOUR PROGRESS" color={CC.rouge} />
          <ProgressPanel />
        </Card>
      </View>

      {/* Achievements */}
      <Card testID="profile-achievements">
        <SectionTitle label="ACHIEVEMENTS" />
        {achievements.length === 0 ? (
          <View style={s.achEmpty}>
            <Ionicons name="trophy-outline" size={24} color={CC.dim} />
            <Text style={s.achEmptyTitle}>No achievements yet</Text>
            <Text style={s.achEmptySub}>Complete rides to start earning badges.</Text>
          </View>
        ) : (
          <View style={s.achGrid}>
            {achievements.map((a) => (
              <View key={a.label} style={s.achCard}>
                <View style={[s.achIcon, { backgroundColor: a.color + "22", borderColor: a.color }]}>
                  <Ionicons name={a.icon} size={20} color={a.color} />
                </View>
                <Text style={s.achLabel}>{a.label}</Text>
                <Text style={s.achSub}>{a.sub}</Text>
              </View>
            ))}
          </View>
        )}
      </Card>

      <EditModal visible={editing} profile={profile} ftp={settings.ftp} onClose={() => setEditing(false)} onSave={(p, ftp) => { update(p); setSetting("ftp", ftp); setSetting("ftpAuto", false); setEditing(false); }} />
    </AppScaffold>
  );
}

function EditModal({ visible, profile, ftp: ftpInit, onClose, onSave }: { visible: boolean; profile: RiderProfile; ftp: number; onClose: () => void; onSave: (p: Partial<RiderProfile>, ftp: number) => void }) {
  const [name, setName] = React.useState(profile.name);
  const [weight, setWeight] = React.useState(String(Math.round(profile.weight_kg)));
  const [age, setAge] = React.useState(String(profile.age));
  const [ftp, setFtp] = React.useState(String(ftpInit));
  const [gender, setGender] = React.useState(profile.gender);
  const [capability, setCapability] = React.useState(profile.capability);
  const [city, setCity] = React.useState(profile.city);
  const [region, setRegion] = React.useState(profile.region);
  const [country, setCountry] = React.useState(profile.country);

  React.useEffect(() => {
    if (visible) {
      setName(profile.name);
      setWeight(String(Math.round(profile.weight_kg)));
      setAge(String(profile.age));
      setFtp(String(ftpInit));
      setGender(profile.gender);
      setCapability(profile.capability);
      setCity(profile.city);
      setRegion(profile.region);
      setCountry(profile.country);
    }
  }, [visible, profile, ftpInit]);

  const save = () => {
    onSave({
      name: name.trim() || "Rider One",
      weight_kg: Math.max(30, Math.min(200, parseInt(weight, 10) || 78)),
      age: Math.max(12, Math.min(100, parseInt(age, 10) || 42)),
      gender,
      capability,
      city: city.trim(),
      region: region.trim(),
      country: country.trim(),
    }, Math.max(50, Math.min(600, parseInt(ftp, 10) || 200)));
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.modalBackdrop}>
        <View style={s.modalCard} testID="edit-profile-modal">
          <Text style={s.modalTitle}>Edit rider profile</Text>
          <Text style={s.modalSub}>These details tune your coach&apos;s advice.</Text>

          <Text style={s.fieldLabel}>Name</Text>
          <TextInput testID="input-name" value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={CC.dim} style={s.input} />

          <View style={s.fieldRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.fieldLabel}>Weight (kg)</Text>
              <TextInput testID="input-weight" value={weight} onChangeText={setWeight} keyboardType="number-pad" maxLength={3} style={s.input} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.fieldLabel}>Age</Text>
              <TextInput testID="input-age" value={age} onChangeText={setAge} keyboardType="number-pad" maxLength={3} style={s.input} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.fieldLabel}>FTP (W)</Text>
              <TextInput testID="input-ftp" value={ftp} onChangeText={setFtp} keyboardType="number-pad" maxLength={3} style={s.input} />
            </View>
          </View>
          <Text style={s.locHint}>Editing FTP turns off auto-sync so your value sticks.</Text>

          <Text style={s.fieldLabel}>Gender</Text>
          <View style={s.genderRow}>
            {GENDERS.map((g) => {
              const on = gender === g.id;
              return (
                <Pressable key={g.id} testID={`gender-${g.id}`} onPress={() => setGender(g.id)} style={[s.genderChip, on && s.genderChipOn]}>
                  <Text style={[s.genderText, on && s.genderTextOn]}>{g.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={s.fieldLabel}>Riding capability</Text>
          <View style={s.genderRow}>
            {CAPS.map((c) => {
              const on = capability === c.id;
              return (
                <Pressable key={c.id} testID={`capability-${c.id}`} onPress={() => setCapability(c.id as RiderProfile["capability"])} style={[s.genderChip, on && s.genderChipOn]}>
                  <Text style={[s.genderText, on && s.genderTextOn]}>{c.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={s.locHint}>Sets which workouts are shown to you by default.</Text>

          <Text style={s.fieldLabel}>City / Suburb</Text>
          <TextInput testID="input-city" value={city} onChangeText={setCity} placeholder="e.g. Melbourne" placeholderTextColor={CC.dim} style={s.input} />
          <View style={s.fieldRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.fieldLabel}>State / Region</Text>
              <TextInput testID="input-region" value={region} onChangeText={setRegion} placeholder="e.g. Victoria" placeholderTextColor={CC.dim} style={s.input} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.fieldLabel}>Country</Text>
              <TextInput testID="input-country" value={country} onChangeText={setCountry} placeholder="e.g. Australia" placeholderTextColor={CC.dim} style={s.input} />
            </View>
          </View>
          <Text style={s.locHint}>Used for live temperature on your ride screen.</Text>

          <View style={s.modalActions}>
            <Pressable testID="cancel-edit" onPress={onClose} style={[s.modalBtn, s.modalBtnGhost]}>
              <Text style={s.modalBtnGhostText}>Cancel</Text>
            </Pressable>
            <Pressable testID="save-edit" onPress={save} style={[s.modalBtn, s.modalBtnPrimary]}>
              <Text style={s.modalBtnPrimaryText}>Save</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", gap: 16 },

  identityRow: { flexDirection: "row", alignItems: "flex-start", gap: 16 },
  avatarWrap: { width: 84, height: 84, borderRadius: 42, borderWidth: 2, borderColor: CC.yellow },
  avatar: { width: "100%", height: "100%", borderRadius: 42 },
  cameraBadge: { position: "absolute", right: -2, bottom: -2, width: 28, height: 28, borderRadius: 14, backgroundColor: CC.yellow, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: CC.bg },
  name: { color: CC.white, fontSize: 24, fontWeight: "900" },
  org: { color: CC.dim, fontSize: 13, marginTop: 2 },
  locRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 },
  locText: { color: CC.white, fontSize: 13, fontWeight: "600" },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" },
  tierBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: CC.yellow, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 11 },
  tierText: { color: "#241B00", fontSize: 12, fontWeight: "800" },
  coachChip: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: CC.border, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 8 },
  coachChipImg: { width: 20, height: 20, borderRadius: 10 },
  coachChipText: { color: CC.white, fontSize: 12, fontWeight: "600" },

  editBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: CC.border, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: "rgba(255,255,255,0.04)" },
  hover: { borderColor: "rgba(255,255,255,0.3)" },
  editText: { color: CC.white, fontSize: 13, fontWeight: "700" },

  statsRow: { flexDirection: "row", gap: 12, marginTop: 18, borderTopWidth: 1, borderTopColor: CC.borderSoft, paddingTop: 16 },
  stat: { flex: 1 },
  statVal: { color: CC.white, fontSize: 22, fontWeight: "900" },
  statLbl: { color: CC.dim, fontSize: 11, fontWeight: "700", letterSpacing: 0.4, marginTop: 3 },
  feedNote: { color: CC.dim, fontSize: 11.5, lineHeight: 16, marginTop: 14 },

  seasonRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9 },
  seasonIcon: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.03)" },
  periodRow: { gap: 8, paddingBottom: 12 },
  periodPill: { borderWidth: 1, borderColor: CC.border, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14, backgroundColor: "rgba(255,255,255,0.03)", justifyContent: "center" },
  periodPillOn: { backgroundColor: CC.rouge, borderColor: CC.rouge },
  periodText: { color: CC.white, fontSize: 12.5, fontWeight: "700" },
  periodTextOn: { color: "#fff" },
  seasonLabel: { color: CC.white, fontSize: 14, fontWeight: "600" },
  seasonValue: { color: CC.white, fontSize: 15, fontWeight: "800" },

  achGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  achEmpty: { alignItems: "center", justifyContent: "center", paddingVertical: 22, gap: 6 },
  achEmptyTitle: { color: CC.white, fontSize: 15, fontWeight: "800", marginTop: 4 },
  achEmptySub: { color: CC.dim, fontSize: 12.5 },
  achCard: { flexGrow: 1, flexBasis: 150, minWidth: 140, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: CC.border, borderRadius: 14, padding: 14, alignItems: "flex-start", gap: 4 },
  achIcon: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  achLabel: { color: CC.white, fontSize: 14, fontWeight: "800" },
  achSub: { color: CC.dim, fontSize: 12 },

  // edit modal
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", alignItems: "center", justifyContent: "center", padding: 24 },
  modalCard: { width: "100%", maxWidth: 440, backgroundColor: CC.card, borderWidth: 1, borderColor: CC.border, borderRadius: 20, padding: 22 },
  modalTitle: { color: CC.white, fontSize: 19, fontWeight: "900" },
  modalSub: { color: CC.dim, fontSize: 12.5, marginTop: 3, marginBottom: 12 },
  fieldLabel: { color: CC.dim, fontSize: 11, fontWeight: "800", letterSpacing: 0.4, marginTop: 12, marginBottom: 6 },
  input: { backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: CC.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: Platform.OS === "ios" ? 12 : 9, color: CC.white, fontSize: 15, fontWeight: "600" },
  fieldRow: { flexDirection: "row", gap: 12 },
  genderRow: { flexDirection: "row", gap: 8 },
  genderChip: { flex: 1, alignItems: "center", paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: CC.border, backgroundColor: "rgba(255,255,255,0.03)" },
  genderChipOn: { backgroundColor: CC.rouge, borderColor: CC.rouge },
  genderText: { color: CC.white, fontSize: 13, fontWeight: "700" },
  genderTextOn: { color: "#fff" },
  locHint: { color: CC.dim, fontSize: 11, marginTop: 8 },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 22 },
  modalBtn: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 12 },
  modalBtnGhost: { borderWidth: 1, borderColor: CC.border },
  modalBtnGhostText: { color: CC.white, fontSize: 14, fontWeight: "700" },
  modalBtnPrimary: { backgroundColor: CC.yellow },
  modalBtnPrimaryText: { color: "#241B00", fontSize: 14, fontWeight: "900" },
});
