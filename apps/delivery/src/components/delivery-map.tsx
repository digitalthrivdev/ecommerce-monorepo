import { House, LocateFixed, Store, type LucideIcon } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";

import { Icon } from "@/components/ui/icon";
import { useAppTheme } from "@/lib/app-theme";
import type { PartnerDelivery } from "@/lib/types";

type Point = { latitude: number; longitude: number };

const START_DELTA = 0.03;
const EDGE_PADDING = { top: 48, right: 48, bottom: 48, left: 48 };
/** Android draws a custom marker into a bitmap once; it has to keep redrawing until the icon has rendered. */
const MARKER_RENDER_MS = 1000;

/** Rounded to about 100 m, so the map only re-zooms when the partner has moved a noticeable distance. */
const pointKey = (point: Point) => `${point.latitude.toFixed(3)},${point.longitude.toFixed(3)}`;

function parsePoint(key: string): Point {
  const [latitude, longitude] = key.split(",").map(Number);
  return { latitude, longitude };
}

function toPoint(latitude?: string | null, longitude?: string | null): Point | null {
  return latitude && longitude ? { latitude: Number(latitude), longitude: Number(longitude) } : null;
}

function PlaceMarker({ coordinate, label, icon: IconComponent, background, foreground }: { coordinate: Point; label: string; icon: LucideIcon; background: string; foreground: string }) {
  const [rendering, setRendering] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setRendering(false), MARKER_RENDER_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Marker coordinate={coordinate} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={rendering} accessibilityLabel={label}>
      <View style={{ backgroundColor: background, borderColor: "#FFFFFF" }} className="size-9 items-center justify-center rounded-full border-2">
        <IconComponent size={18} color={foreground} />
      </View>
    </Marker>
  );
}

/**
 * The partner (blue dot), the store while heading there, and the customer, with a line through the stops
 * ahead. Kept in view until the partner drags or zooms the map; the recentre button resumes following.
 */
export function DeliveryMap({ delivery }: { delivery: PartnerDelivery }) {
  const { colors, neutral } = useAppTheme();
  const mapRef = useRef<MapView>(null);
  const [ready, setReady] = useState(false);
  const [following, setFollowing] = useState(true);
  const [me, setMe] = useState<Point | null>(null);

  const store = toPoint(delivery.store.latitude, delivery.store.longitude)!;
  const customer = toPoint(delivery.customer.latitude, delivery.customer.longitude);
  const headingToStore = delivery.orderStatus === "ASSIGNED";
  const [startRegion] = useState(() => ({ ...(headingToStore || !customer ? store : customer), latitudeDelta: START_DELTA, longitudeDelta: START_DELTA }));

  const route = [me, headingToStore ? store : null, customer].filter((point): point is Point => point !== null);
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
        showsUserLocation
        showsMyLocationButton={false}
        onUserLocationChange={({ nativeEvent }) => {
          if (nativeEvent.coordinate) setMe({ latitude: nativeEvent.coordinate.latitude, longitude: nativeEvent.coordinate.longitude });
        }}
        onPanDrag={() => setFollowing(false)}
        onRegionChangeComplete={(_, details) => {
          if (details.isGesture) setFollowing(false);
        }}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
      >
        {route.length >= 2 && <Polyline coordinates={route} strokeColor={colors.primary} strokeWidth={3} lineDashPattern={[8, 6]} />}
        {headingToStore && <PlaceMarker key={`store-${colors.primary}`} coordinate={store} label="Store" icon={Store} background={colors.primary} foreground={colors.onPrimary} />}
        {customer && <PlaceMarker key={`home-${neutral.foreground}`} coordinate={customer} label="Customer" icon={House} background={neutral.foreground} foreground={neutral.card} />}
      </MapView>
      {!following && (
        <Pressable
          onPress={() => setFollowing(true)}
          className="absolute right-3 top-3 size-10 items-center justify-center rounded-full bg-card shadow-md active:bg-accent"
          accessibilityLabel="Show the whole route"
          hitSlop={6}
        >
          <Icon as={LocateFixed} size={20} className="text-primary" />
        </Pressable>
      )}
    </View>
  );
}
