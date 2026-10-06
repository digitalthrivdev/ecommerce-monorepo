import { Bike, House, LocateFixed, Store, type LucideIcon } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import MapView, { Marker, Polyline, type MapMarker } from "react-native-maps";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useAppTheme } from "@/lib/app-theme";
import { TRACKING_REFRESH_MS } from "@/lib/orders";
import type { Coordinates, OrderTracking } from "@/lib/types";

const START_DELTA = 0.03;
const EDGE_PADDING = { top: 48, right: 48, bottom: 48, left: 48 };
/** Android draws a custom marker into a bitmap once; it has to keep redrawing until the icon has rendered. */
const MARKER_RENDER_MS = 1000;

const pointKey = (point: Coordinates) => `${point.latitude.toFixed(4)},${point.longitude.toFixed(4)}`;

function parsePoint(key: string): Coordinates {
  const [latitude, longitude] = key.split(",").map(Number);
  return { latitude, longitude };
}

function useMarkerRendering() {
  const [rendering, setRendering] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setRendering(false), MARKER_RENDER_MS);
    return () => clearTimeout(timer);
  }, []);
  return rendering;
}

type BadgeProps = { icon: LucideIcon; background: string; foreground: string };

function Badge({ icon: IconComponent, background, foreground }: BadgeProps) {
  return (
    <View style={{ backgroundColor: background, borderColor: "#FFFFFF" }} className="size-9 items-center justify-center rounded-full border-2">
      <IconComponent size={18} color={foreground} />
    </View>
  );
}

function PlaceMarker({ coordinate, label, ...badge }: BadgeProps & { coordinate: Coordinates; label: string }) {
  const rendering = useMarkerRendering();
  return (
    <Marker coordinate={coordinate} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={rendering} accessibilityLabel={label}>
      <Badge {...badge} />
    </Marker>
  );
}

/** Glides to each new position over one refresh, so the partner appears to move continuously. */
function RiderMarker({ location, ...badge }: BadgeProps & { location: Coordinates }) {
  const ref = useRef<MapMarker>(null);
  const [start] = useState(location);
  const rendering = useMarkerRendering();

  useEffect(() => {
    ref.current?.animateMarkerToCoordinate(location, TRACKING_REFRESH_MS);
  }, [location]);

  return (
    <Marker ref={ref} coordinate={start} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={rendering} accessibilityLabel="Your delivery partner">
      <Badge {...badge} />
    </Marker>
  );
}

/**
 * The partner, the store while they head there, and the delivery address, kept in view as the partner
 * moves until the customer drags or zooms the map; the recentre button resumes following.
 */
export function TrackingMap({ tracking }: { tracking: OrderTracking }) {
  const { colors, neutral } = useAppTheme();
  const mapRef = useRef<MapView>(null);
  const [ready, setReady] = useState(false);
  const [following, setFollowing] = useState(true);
  const [startRegion] = useState(() => ({ ...tracking.store, latitudeDelta: START_DELTA, longitudeDelta: START_DELTA }));

  const rider = tracking.partnerLocation;
  const home = tracking.destination;
  const showStore = tracking.orderStatus === "ASSIGNED" || !rider;
  const route = [rider, showStore ? tracking.store : null, home].filter((point): point is Coordinates => point !== null);
  const fitKey = route.map(pointKey).join("|");

  useEffect(() => {
    const points = fitKey.split("|").map(parsePoint);
    if (!ready || !following || points.length < 2) return;
    mapRef.current?.fitToCoordinates(points, { edgePadding: EDGE_PADDING, animated: true });
  }, [ready, following, fitKey]);

  return (
    <View className="mx-4 h-64 overflow-hidden rounded-lg border border-border">
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        initialRegion={startRegion}
        onMapReady={() => setReady(true)}
        onPanDrag={() => setFollowing(false)}
        onRegionChangeComplete={(_, details) => {
          if (details.isGesture) setFollowing(false);
        }}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        showsMyLocationButton={false}
      >
        {route.length >= 2 && <Polyline coordinates={route} strokeColor={colors.primary} strokeWidth={3} lineDashPattern={[8, 6]} />}
        {showStore && (
          <PlaceMarker key={`store-${neutral.card}`} coordinate={tracking.store} label="Store" icon={Store} background={neutral.card} foreground={neutral.foreground} />
        )}
        {home && <PlaceMarker key={`home-${neutral.foreground}`} coordinate={home} label="Delivery address" icon={House} background={neutral.foreground} foreground={neutral.card} />}
        {rider && <RiderMarker key={`rider-${colors.primary}`} location={rider} icon={Bike} background={colors.primary} foreground={colors.onPrimary} />}
      </MapView>
      {!following && (
        <Pressable
          onPress={() => setFollowing(true)}
          className="absolute right-3 top-3 size-10 items-center justify-center rounded-full bg-card shadow-md active:bg-accent"
          accessibilityLabel="Show your delivery partner and address"
          hitSlop={6}
        >
          <Icon as={LocateFixed} size={20} className="text-primary" />
        </Pressable>
      )}
      {!rider && (
        <View pointerEvents="none" className="absolute bottom-3 left-3 right-3 items-center">
          <Text className="rounded-full bg-card px-3 py-1.5 text-xs font-semibold shadow-sm">Waiting for your delivery partner&apos;s location…</Text>
        </View>
      )}
    </View>
  );
}
