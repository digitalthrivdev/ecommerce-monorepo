import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { Camera, X } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AddButton, QuantityStepper } from "@/components/add-to-cart";
import { FocusStatusBar } from "@/components/focus-status-bar";
import { FormField } from "@/components/form-field";
import { QueryError } from "@/components/query-error";
import { ScreenHeader } from "@/components/screen-header";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { errorMessage } from "@/lib/api";
import { useAppTheme, useCardSurface } from "@/lib/app-theme";
import { smallImage } from "@/lib/images";
import { COMPLAINT_REASON_TEXT, uploadComplaintPhoto, useOrder, useReportIssue } from "@/lib/orders";
import type { ComplaintReason, OrderDetail } from "@/lib/types";
import { cn } from "@/lib/utils";

const MAX_PHOTOS = 3;
const PHOTO_QUALITY = 0.7;
const REASONS = Object.keys(COMPLAINT_REASON_TEXT) as ComplaintReason[];

type Photo = { localUri: string; url: string | null };
type OrderItem = OrderDetail["items"][number];

const deliveredUnits = (item: OrderItem) => item.quantity - item.unavailableQuantity;

function ItemRow({ item, quantity, onChange }: { item: OrderItem; quantity: number; onChange: (quantity: number) => void }) {
  const [failed, setFailed] = useState(false);
  const delivered = deliveredUnits(item);

  return (
    <View className="flex-row items-center gap-3">
      <View className="size-12 items-center justify-center overflow-hidden rounded-md bg-tile">
        {item.imageUrl && !failed ? (
          <Image source={{ uri: smallImage(item.imageUrl) }} style={{ width: "86%", height: "86%" }} contentFit="contain" onError={() => setFailed(true)} />
        ) : (
          <Text className="text-base font-extrabold text-primary">{item.productName.charAt(0)}</Text>
        )}
      </View>
      <View className="flex-1 gap-0.5">
        <Text className="text-sm" numberOfLines={2}>
          {item.productName}
        </Text>
        <Text className="text-xs text-muted-foreground">{[item.variantName, `${delivered} delivered`].filter(Boolean).join(" · ")}</Text>
      </View>
      {quantity > 0 ? (
        <QuantityStepper quantity={quantity} max={delivered} onChange={(next) => onChange(Math.max(0, Math.min(next, delivered)))} />
      ) : (
        <AddButton onPress={() => onChange(1)} disabled={false} accessibilityLabel={`Request return for ${item.productName}`} />
      )}
    </View>
  );
}

function ReportForm({ order, onSubmitted }: { order: OrderDetail; onSubmitted: () => void }) {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const surface = useCardSurface();
  const report = useReportIssue(order.id);
  const [reason, setReason] = useState<ComplaintReason | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const deliveredItems = order.items.filter((item) => deliveredUnits(item) > 0);
  const items = Object.entries(quantities)
    .filter(([, quantity]) => quantity > 0)
    .map(([orderItemId, quantity]) => ({ orderItemId, quantity }));
  const uploading = photos.some((photo) => !photo.url);

  async function pickPhoto(source: "camera" | "library") {
    let result: ImagePicker.ImagePickerResult;
    try {
      if (source === "camera") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert("Camera not allowed", "Allow camera access in your phone's settings, or choose a photo from your gallery.");
          return;
        }
        result = await ImagePicker.launchCameraAsync({ mediaTypes: "images", quality: PHOTO_QUALITY });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", quality: PHOTO_QUALITY });
      }
    } catch (caught) {
      Alert.alert("Couldn't open your photos", errorMessage(caught));
      return;
    }
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setPhotos((current) => [...current, { localUri: asset.uri, url: null }]);
    try {
      const { url } = await uploadComplaintPhoto(order.id, asset);
      setPhotos((current) => current.map((photo) => (photo.localUri === asset.uri ? { ...photo, url } : photo)));
    } catch (caught) {
      setPhotos((current) => current.filter((photo) => photo.localUri !== asset.uri));
      Alert.alert("Couldn't upload the photo", errorMessage(caught));
    }
  }

  const addPhoto = () =>
    Alert.alert("Add a photo", undefined, [
      { text: "Take photo", onPress: () => pickPhoto("camera") },
      { text: "Choose from gallery", onPress: () => pickPhoto("library") },
      { text: "Cancel", style: "cancel" },
    ]);

  async function submit() {
    setError(null);
    if (!items.length) return setError("Choose the items you want to return.");
    if (!reason) return setError("Choose what went wrong.");
    if (reason === "OTHER" && !note.trim()) return setError("Tell us what went wrong.");

    try {
      await report.mutateAsync({
        reason,
        note: note.trim() || undefined,
        items,
        photoUrls: photos.flatMap((photo) => (photo.url ? [photo.url] : [])),
      });
      onSubmitted();
      router.back();
      Alert.alert("Return requested", "We’ll review your request and update you here.");
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1">
      <ScrollView contentContainerClassName="gap-5 px-4 pb-6 pt-2" keyboardShouldPersistTaps="handled">
        <Text className="text-sm text-muted-foreground">
          Order {order.orderNumber}
        </Text>

        <View className="gap-2">
          <Text className="text-base font-bold">Which items would you like to return?</Text>
          <View className={cn("gap-3 rounded-lg p-4", surface)}>
            {deliveredItems.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                quantity={quantities[item.id] ?? 0}
                onChange={(quantity) => setQuantities((current) => ({ ...current, [item.id]: quantity }))}
              />
            ))}
          </View>
        </View>

        <View className="gap-2">
          <Text className="text-base font-bold">What went wrong?</Text>
          <View className="flex-row flex-wrap gap-2">
            {REASONS.map((value) => (
              <Pressable
                key={value}
                onPress={() => setReason(value)}
                className={cn("rounded-full border px-4 py-2", reason === value ? "border-primary bg-primary/10" : "border-border bg-card")}
                accessibilityRole="radio"
                accessibilityState={{ checked: reason === value }}
              >
                <Text className={cn("text-sm font-semibold", reason === value && "text-primary")}>{COMPLAINT_REASON_TEXT[value]}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <FormField
          label="Tell us more"
          optional={reason !== "OTHER"}
          value={note}
          onChangeText={setNote}
          placeholder="The milk packet was leaking"
          multiline
          maxLength={1000}
          textAlignVertical="top"
          className="h-24 py-3"
        />

        <View className="gap-2">
          <Text className="text-sm font-semibold">
            Photos<Text className="text-sm font-normal text-muted-foreground"> (optional, up to {MAX_PHOTOS})</Text>
          </Text>
          <View className="flex-row gap-3">
            {photos.map((photo) => (
              <View key={photo.localUri} className="size-20 overflow-hidden rounded-lg bg-muted">
                <Image source={{ uri: photo.localUri }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                {photo.url ? (
                  <Pressable
                    onPress={() => setPhotos((current) => current.filter((other) => other.localUri !== photo.localUri))}
                    className="absolute right-1 top-1 size-6 items-center justify-center rounded-full bg-black/60"
                    accessibilityLabel="Remove photo"
                    hitSlop={6}
                  >
                    <Icon as={X} size={14} className="text-white" />
                  </Pressable>
                ) : (
                  <View className="absolute inset-0 items-center justify-center bg-black/40">
                    <ActivityIndicator color="#FFFFFF" />
                  </View>
                )}
              </View>
            ))}
            {photos.length < MAX_PHOTOS && (
              <Pressable onPress={addPhoto} className="size-20 items-center justify-center gap-1 rounded-lg border border-dashed border-input active:bg-accent" accessibilityLabel="Add a photo">
                <Icon as={Camera} size={22} className="text-muted-foreground" />
                <Text className="text-xs text-muted-foreground">Add</Text>
              </Pressable>
            )}
          </View>
        </View>
      </ScrollView>

      <View className="gap-2 border-t border-border bg-card px-4 pt-3" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
        {error && <Text className="text-sm text-destructive">{error}</Text>}
        <Button onPress={submit} disabled={report.isPending || uploading} className="h-12 rounded-lg">
          {report.isPending ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text className="text-base font-bold">{uploading ? "Uploading photo…" : "Request return"}</Text>
          )}
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}

export default function ReportIssueScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const order = useOrder(id);
  const [submitted, setSubmitted] = useState(false);

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <FocusStatusBar />
      <ScreenHeader title="Request a return" />
      {order.data ? (
        order.data.canRequestReturn || submitted ? (
          <ReportForm order={order.data} onSubmitted={() => setSubmitted(true)} />
        ) : (
          <Text className="px-8 py-10 text-center text-sm text-muted-foreground">
            {order.data.returnRequest ? "A return request already exists for this order." : "The return window for this order has closed."}
          </Text>
        )
      ) : order.isPending ? (
        <ActivityIndicator color={colors.primary} className="py-12" />
      ) : (
        <QueryError error={order.error} onRetry={() => order.refetch()} />
      )}
    </View>
  );
}
