import React, { useEffect, useRef, useState } from "react";
import { Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { Analytics } from "@/lib/posthog";
import type { CommercialOffer, CommercialTargetType } from "@/lib/commercial-api";

interface Props {
  offer: CommercialOffer;
  targetType: CommercialTargetType;
  targetId: string;
}

function creativeSource(value: string): string {
  return value.startsWith("//") ? `https:${value}` : value;
}

export function CommercialOfferCard({ offer, targetType, targetId }: Props) {
  const [creativeFailed, setCreativeFailed] = useState(false);
  const viewedRef = useRef(false);
  const brand = offer.brand_name ?? offer.program_name ?? "Featured partner";
  const discount = offer.discount_percent != null
    ? `${offer.discount_percent}% off`
    : offer.discount_amount != null
      ? `${offer.discount_currency ?? ""}${offer.discount_amount} off`
      : null;

  useEffect(() => {
    Analytics.commercialOfferRendered({ offer_id: offer.id, target_type: targetType, target_id: targetId });
  }, [offer.id, targetId, targetType]);

  function markViewed() {
    if (viewedRef.current) return;
    viewedRef.current = true;
    Analytics.commercialOfferViewed({ offer_id: offer.id, target_type: targetType, target_id: targetId });
  }

  function openOffer() {
    if (!offer.tracking_url) return;
    Analytics.commercialOfferClicked({ offer_id: offer.id, target_type: targetType, target_id: targetId });
    void Linking.openURL(offer.tracking_url);
  }

  return (
    <View
      style={styles.card}
      onLayout={markViewed}
      accessibilityLabel={`Featured Offer from ${brand}`}
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>
          {targetType === "fantasy_weekly" ? "WEEKLY FEATURED OFFER" : "GAME DAY FEATURED OFFER"}
        </Text>
        <Text style={styles.badge}>FEATURED OFFER</Text>
      </View>
      {!creativeFailed && targetType === "game_day" && offer.creative_url ? (
        <Image
          source={{ uri: creativeSource(offer.creative_url) }}
          style={styles.creative}
          resizeMode="contain"
          onError={() => setCreativeFailed(true)}
        />
      ) : null}
      <View style={styles.body}>
        <Text style={styles.brand}>{brand}</Text>
        <Text style={styles.title}>{offer.title}</Text>
        {offer.description ? <Text style={styles.description}>{offer.description}</Text> : null}
        <View style={styles.metaRow}>
          {discount ? <Text style={styles.meta}>{discount}</Text> : null}
          {offer.discount_type && !discount ? <Text style={styles.meta}>{offer.discount_type}</Text> : null}
          {offer.promo_code ? <Text style={styles.code}>Code: {offer.promo_code}</Text> : null}
        </View>
        <Pressable
          style={[styles.cta, !offer.tracking_url && styles.ctaDisabled]}
          onPress={openOffer}
          disabled={!offer.tracking_url}
        >
          <Text style={styles.ctaText}>{offer.tracking_url ? `Shop ${brand}` : "Offer link unavailable"}</Text>
          {offer.tracking_url ? <Ionicons name="arrow-forward" size={15} color="#000" /> : null}
        </Pressable>
        <Text style={styles.disclosure}>{offer.disclosure}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 12,
    overflow: "hidden",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: `${Colors.dark.tint}80`,
    backgroundColor: "#0D1020",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  eyebrow: { color: Colors.dark.textSecondary, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  badge: { color: "#FBBF24", fontSize: 9, fontWeight: "900", letterSpacing: 0.7 },
  creative: { width: "100%", height: 118, backgroundColor: Colors.dark.background },
  body: { padding: 16, gap: 9 },
  brand: { color: Colors.dark.tint, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8 },
  title: { color: Colors.dark.text, fontSize: 20, lineHeight: 25, fontWeight: "800" },
  description: { color: Colors.dark.textSecondary, fontSize: 13, lineHeight: 19 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, alignItems: "center" },
  meta: { color: Colors.dark.text, fontSize: 12, fontWeight: "800", backgroundColor: `${Colors.dark.tint}25`, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5 },
  code: { color: "#FBBF24", fontSize: 12, fontWeight: "800", backgroundColor: "#FBBF2418", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5 },
  cta: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 10, backgroundColor: "#FFC72C", paddingHorizontal: 15, paddingVertical: 11 },
  ctaDisabled: { backgroundColor: Colors.dark.border },
  ctaText: { color: "#000", fontSize: 13, fontWeight: "900" },
  disclosure: { color: Colors.dark.textSecondary, fontSize: 10, lineHeight: 15 },
});