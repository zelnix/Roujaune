import React from "react";
import { View, Text, StyleSheet, Pressable, Image, ActivityIndicator, Alert, Linking } from "react-native";
import * as ImagePicker from "expo-image-picker";
import Ionicons from "@react-native-vector-icons/ionicons";
import { colors, radius, spacing } from "@/src/theme";
import { RidePhoto, listRidePhotos, uploadRidePhoto, deleteRidePhoto, ridePhotoUri } from "@/src/lib/ride-photos";

/** A per-ride photo gallery: view, add (camera roll) and remove ride photos.
 *  Renders nothing until we have a saved ride id. */
export function RidePhotos({ rideId, onToast }: { rideId?: string | null; onToast?: (m: string) => void }) {
  const [photos, setPhotos] = React.useState<RidePhoto[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!rideId) return;
    setPhotos(await listRidePhotos(rideId));
    setLoaded(true);
  }, [rideId]);

  React.useEffect(() => { load(); }, [load]);

  const ensurePermission = async (): Promise<boolean> => {
    const cur = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (cur.granted) return true;
    if (cur.canAskAgain) {
      const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (req.granted) return true;
    }
    Alert.alert(
      "Photos access needed",
      "Allow photo access to add pictures to your ride.",
      [{ text: "Not now", style: "cancel" }, { text: "Open Settings", onPress: () => Linking.openSettings() }],
    );
    return false;
  };

  const pick = async () => {
    if (!rideId || busy) return;
    if (!(await ensurePermission())) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    setBusy(true);
    try {
      await uploadRidePhoto(rideId, { uri: a.uri, name: a.fileName, mimeType: a.mimeType });
      await load();
      onToast?.("Photo added");
    } catch (e: any) {
      onToast?.(e?.message || "Couldn't add photo");
    } finally { setBusy(false); }
  };

  const remove = (p: RidePhoto) => {
    Alert.alert("Remove photo?", "This removes it from this ride.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => { if (rideId) { await deleteRidePhoto(rideId, p.id); await load(); } } },
    ]);
  };

  if (!rideId) return null;

  return (
    <View style={s.card} testID="ride-photos">
      <View style={s.head}>
        <Text style={s.title}>PHOTOS</Text>
        {photos.length > 0 && <Text style={s.count}>{photos.length}</Text>}
      </View>
      <View style={s.grid}>
        {photos.map((p) => (
          <Pressable key={p.id} style={s.thumbWrap} onLongPress={() => remove(p)} delayLongPress={350} testID={`ride-photo-${p.id}`}>
            <Image source={{ uri: ridePhotoUri(p.path) }} style={s.thumb} resizeMode="cover" />
            <Pressable onPress={() => remove(p)} hitSlop={6} style={s.del} testID={`ride-photo-del-${p.id}`}>
              <Ionicons name="close" size={13} color="#fff" />
            </Pressable>
          </Pressable>
        ))}
        <Pressable style={[s.thumbWrap, s.add]} onPress={pick} disabled={busy} testID="ride-photo-add">
          {busy ? <ActivityIndicator size="small" color={colors.yellow} />
            : <><Ionicons name="camera-outline" size={22} color={colors.yellow} /><Text style={s.addTxt}>Add</Text></>}
        </Pressable>
      </View>
      {loaded && photos.length === 0 && <Text style={s.hint}>Add photos from your ride — they stay in ROUJAUNE (Strava doesn&apos;t allow app photo uploads).</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { color: colors.white, fontSize: 13, fontWeight: "800", letterSpacing: 0.6 },
  count: { color: colors.textFaint, fontSize: 12, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  thumbWrap: { width: 84, height: 84, borderRadius: radius.md, overflow: "hidden", position: "relative", backgroundColor: colors.cardElevated },
  thumb: { width: "100%", height: "100%" },
  del: { position: "absolute", top: 3, right: 3, width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  add: { borderWidth: 1, borderColor: "rgba(245,179,1,0.5)", borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 2 },
  addTxt: { color: colors.yellow, fontSize: 11, fontWeight: "700" },
  hint: { color: colors.textFaint, fontSize: 11.5, lineHeight: 16 },
});
