import * as Location from "expo-location";
import { StatusBar } from "expo-status-bar";
import { ArrowLeft, LocateFixed, MapPin, Search } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, TextInput, View } from "react-native";
import MapView, { type Region } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { errorMessage } from "@/lib/api";
import { useAppTheme } from "@/lib/app-theme";
import { describePlace, getCurrentCoordinates, type PlaceDetails } from "@/lib/location";
import type { Coordinates } from "@/lib/types";

const STREET_DELTA = 0.004;
/** Zoomed out further than this (about 5 km across), the pin is too rough to deliver to. */
const MAX_PIN_DELTA = 0.05;
const SETTLE_MS = 400;
const WORLD: Region = { latitude: 20, longitude: 0, latitudeDelta: 100, longitudeDelta: 100 };

const streetRegion = (point: Coordinates): Region => ({ ...point, latitudeDelta: STREET_DELTA, longitudeDelta: STREET_DELTA });

type MapPinPickerProps = {
  visible: boolean;
  /** The pin to start from; without it the picker finds the phone's position. */
  initial: Coordinates | null;
  onClose: () => void;
  onConfirm: (coordinates: Coordinates, place: PlaceDetails | null) => void;
};

/** Full-screen map with a fixed pin in the middle: the customer moves the map until the pin is on their door. */
export function MapPinPicker({ visible, onClose, ...props }: MapPinPickerProps) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      {visible && <PickerContent onClose={onClose} {...props} />}
    </Modal>
  );
}

function PickerContent({ initial, onClose, onConfirm }: Omit<MapPinPickerProps, "visible">) {
  const insets = useSafeAreaInsets();
  const { colors, neutral } = useAppTheme();
  const mapRef = useRef<MapView>(null);
  const [startRegion] = useState(() => (initial ? streetRegion(initial) : WORLD));
  const [region, setRegion] = useState<Region>(startRegion);
  const [settled, setSettled] = useState<Region>(startRegion);
  const [place, setPlace] = useState<{ key: string; details: PlaceDetails | null } | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<"search" | "locate" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showUser, setShowUser] = useState(false);

  const pinnable = settled.latitudeDelta <= MAX_PIN_DELTA;
  const point = { latitude: settled.latitude, longitude: settled.longitude };
  const key = `${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`;
  const moving = region !== settled;

  useEffect(() => {
    const timer = setTimeout(() => setSettled(region), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [region]);

  useEffect(() => {
    if (!pinnable) return;
    let cancelled = false;
    describePlace({ latitude: settled.latitude, longitude: settled.longitude }).then((details) => {
      if (!cancelled) setPlace({ key: `${settled.latitude.toFixed(5)},${settled.longitude.toFixed(5)}`, details });
    });
    return () => {
      cancelled = true;
    };
  }, [settled, pinnable]);

  function moveTo(target: Coordinates) {
    mapRef.current?.animateToRegion(streetRegion(target), 500);
  }

  async function locate() {
    setBusy("locate");
    setMessage(null);
    try {
      const found = await getCurrentCoordinates();
      setShowUser(true);
      moveTo(found);
    } catch (caught) {
      setMessage(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  const locatedOnOpen = useRef(false);
  useEffect(() => {
    if (initial || locatedOnOpen.current) return;
    locatedOnOpen.current = true;
    locate();
  });

  async function search() {
    const text = query.trim();
    if (!text || busy) return;
    setBusy("search");
    setMessage(null);
    try {
      const [found] = await Location.geocodeAsync(text);
      if (found) moveTo(found);
      else setMessage("We couldn't find that place. Try adding the area and city.");
    } catch {
      setMessage("Search isn't available right now. Move the map to your location instead.");
    } finally {
      setBusy(null);
    }
  }

  const details = place?.key === key ? place.details : null;
  const resolving = pinnable && (moving || place?.key !== key);
  const title = details?.area || details?.summary || (resolving ? "Finding the address…" : pinnable ? "Pinned location" : "Zoom in to your building");
  const subtitle = details ? [details.city, details.state, details.postalCode].filter(Boolean).join(", ") : null;

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" />
      <View className="flex-1">
        <MapView
          ref={mapRef}
          style={{ flex: 1 }}
          initialRegion={startRegion}
          onRegionChangeComplete={setRegion}
          showsUserLocation={showUser}
          showsMyLocationButton={false}
          toolbarEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
        />

        <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
          <View style={{ marginBottom: 44 }}>
            <MapPin size={44} color={colors.onPrimary} fill={colors.primary} strokeWidth={1.5} />
          </View>
        </View>

        <View className="absolute left-0 right-0 flex-row items-center gap-2 px-3" style={{ top: insets.top + 8 }}>
          <Pressable onPress={onClose} className="size-12 items-center justify-center rounded-full bg-card shadow-md active:bg-accent" accessibilityLabel="Close map" hitSlop={4}>
            <Icon as={ArrowLeft} size={22} />
          </Pressable>
          <View className="h-12 flex-1 flex-row items-center gap-2 rounded-full bg-card px-4 shadow-md">
            {busy === "search" ? <ActivityIndicator size="small" color={colors.primary} /> : <Icon as={Search} size={18} className="text-muted-foreground" />}
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search for an area or street"
              placeholderTextColor={neutral.mutedForeground}
              returnKeyType="search"
              onSubmitEditing={search}
              className="h-full flex-1 text-[15px] text-foreground"
            />
          </View>
        </View>

        <Pressable
          onPress={locate}
          disabled={busy !== null}
          className="absolute bottom-4 right-4 size-12 items-center justify-center rounded-full bg-card shadow-md active:bg-accent"
          accessibilityLabel="Use my current location"
        >
          {busy === "locate" ? <ActivityIndicator color={colors.primary} /> : <Icon as={LocateFixed} size={22} className="text-primary" />}
        </Pressable>
      </View>

      <View className="gap-3 rounded-t-2xl bg-card px-4 pt-4 shadow-lg" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
        <Text className="text-xs font-semibold uppercase text-muted-foreground">Delivery location</Text>
        <View className="gap-0.5">
          <Text className="text-base font-bold" numberOfLines={2}>
            {title}
          </Text>
          {subtitle ? <Text className="text-sm text-muted-foreground">{subtitle}</Text> : null}
        </View>
        {message ? <Text className="text-sm text-destructive">{message}</Text> : null}
        <Text className="text-xs text-muted-foreground">Move the map so the pin sits on your building&apos;s entrance.</Text>
        <Button onPress={() => onConfirm(point, details)} disabled={!pinnable || moving} className="h-12 rounded-lg">
          <Text className="text-base font-bold">Confirm location</Text>
        </Button>
      </View>
    </View>
  );
}
