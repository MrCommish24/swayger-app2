import React, { useState, useCallback } from "react";
import {
  View, Text, TextInput, Pressable, ScrollView,
  StyleSheet, ActivityIndicator, Alert, Platform, Modal, Image, Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import { getApiUrl } from "@/lib/query-client";
import Colors from "@/constants/colors";
import {
  assignCommercialOffer,
  CommercialAssignment,
  CommercialOffer,
  CommercialTarget,
  CommercialTargetType,
  listCommercialAssignments,
  listCommercialOffers,
  listCommercialTargets,
  publishCommercialAssignment,
  saveCommercialOffer,
} from "@/lib/commercial-api";

const ADMIN_TOKEN_KEY = "swayger_admin_token";
const NBA_GOLD = "#FFC72C";

// Set to true to restore the legacy template-based global settlement UI.
const LEGACY_GS_ENABLED = false;

// Set to true (and restart backend with GLOBAL_SETTLE_ENABLED=true) to show
// the Settle Group button and confirmation sheet on safe groups.
// Keep false until Milestone 2 is approved and tested.
const GLOBAL_SETTLEMENT_WRITE_ENABLED = false;

// ── Settlement Queue types ──────────────────────────────────────────────────
interface SQAnswerMapEntry {
  stored: string;
  normalized: string;
  round_trips: boolean;
}

interface SQGroup {
  group_key: string;
  phase: string;
  phase_label: string;
  question: string;
  answer_options: string[];
  normalized_options: string[];
  answer_map: SQAnswerMapEntry[];
  has_ambiguous_options: boolean;
  ambiguous_option_details: string[];
  prop_count: number;
  room_count: number;
  prop_ids: string[];
  room_ids: string[];
  template_prop_ids: (string | null)[];
  template_consistency: "consistent" | "mixed" | "none";
  conflicts: string[];
  settlement_status: "safe" | "review_required" | "manual_only";
}

interface SQEvent {
  event_key: string | null;
  is_legacy: boolean;
  game_label: string;
  sport: string | null;
  game_date: string | null;
  team_a: string;
  team_b: string;
  group_count: number;
  prop_count: number;
  safe_count: number;
  review_count: number;
  manual_count: number;
  groups: SQGroup[];
}

interface SQQueue {
  total_events: number;
  total_groups: number;
  total_props: number;
  total_safe: number;
  total_review: number;
  total_manual: number;
  events: SQEvent[];
}

type ImpactReviewAdType = "TEXT_LINK" | "BANNER" | "COUPON";

interface ImpactReviewItem {
  provider: "impact";
  program_id: string | null;
  program_name: string | null;
  brand_id: string | null;
  brand_name: string | null;
  resource_type: "deal" | "ad";
  external_id: string | null;
  title: string | null;
  description: string | null;
  status: string | null;
  availability: "available_to_partner" | null;
  start_at: string | null;
  end_at: string | null;
  promo_code: string | null;
  discount_type: string | null;
  discount_amount: number | null;
  discount_currency: string | null;
  discount_percent: number | null;
  minimum_purchase_amount: number | null;
  maximum_savings_amount: number | null;
  tracking_url: string | null;
  landing_page_url: string | null;
  creative_url: string | null;
  creative_type: string | null;
  creative_width: number | null;
  creative_height: number | null;
  source_updated_at: string | null;
  fetched_at: string;
}

interface ImpactReviewProgram {
  program: {
    program_id: string | null;
    program_name: string | null;
    brand_id: string | null;
    brand_name: string | null;
    status: string | null;
  };
  deals: ImpactReviewItem[];
  ads: ImpactReviewItem[];
  counts: { deals: number; ads: number; creatives: number };
}

interface ImpactReviewResponse {
  ok: boolean;
  fetched_at: string;
  page_size: number;
  updated_within_days: number;
  ad_type: ImpactReviewAdType | null;
  keyword: string | null;
  active_program_count: number;
  programs: ImpactReviewProgram[];
  totals: { deals: number; ads: number; creatives: number };
}

interface PropDef {
  id: string;
  stat: string;
  player_name: string;
  game: string;
  line: number;
  result: "over" | "under" | null;
  status: "open" | "voided";
}

interface Night {
  id: string;
  date: string;
  lock_time: string;
  status: "open" | "locked" | "resolved";
  props: PropDef[];
  sport?: string;
}

const SPORT_OPTIONS = ["NBA", "MLB", "Other"] as const;
type SportOption = typeof SPORT_OPTIONS[number];

const SPORT_COLORS: Record<SportOption | string, string> = {
  NBA: "#FFC72C",
  MLB: "#10B981",
  Other: "#6B7280",
};

function formatDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

function formatLock(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });
}

// ── Convert "7:30 PM" CDT + date string → ISO UTC string ──
// CDT = UTC−5, so UTC = CDT + 5 hours
function cdtTimeToISO(date: string, timeStr: string): string {
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) {
    // fallback: 5:45 PM CDT = 22:45 UTC
    return `${date}T22:45:00.000Z`;
  }
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;
  const utcHours = hours + 5; // CDT → UTC
  const dayOffset = utcHours >= 24 ? 1 : 0;
  const utcH = utcHours % 24;
  const baseDate = new Date(date + "T00:00:00Z");
  baseDate.setUTCDate(baseDate.getUTCDate() + dayOffset);
  const finalDate = baseDate.toISOString().slice(0, 10);
  return `${finalDate}T${String(utcH).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00.000Z`;
}

const DEFAULT_CDT_TIME = "5:45 PM";
const IMPACT_REVIEW_AD_TYPES: { value: ImpactReviewAdType | null; label: string }[] = [
  { value: null, label: "All ads" },
  { value: "TEXT_LINK", label: "Text links" },
  { value: "BANNER", label: "Banners" },
  { value: "COUPON", label: "Coupons" },
];
const IMPACT_REVIEW_DEFAULT_UPDATED_WITHIN_DAYS = 30;
const IMPACT_REVIEW_KEYWORD_MAX_LENGTH = 100;

function normalizeImpactReviewAdType(value: unknown): ImpactReviewAdType | null {
  return value === "TEXT_LINK" || value === "BANNER" || value === "COUPON"
    ? value
    : null;
}

function normalizeImpactReviewKeyword(value: string): string {
  return value.trim().slice(0, IMPACT_REVIEW_KEYWORD_MAX_LENGTH);
}

function formatImpactDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function impactCreativeSource(value: string) {
  return value.startsWith("//") ? `https:${value}` : value;
}

type ImpactPreviewMode = "game_day" | "fantasy_weekly";

function ImpactPreviewCard({
  item,
  mode,
  onOpenTracking,
}: {
  item: ImpactReviewItem;
  mode: ImpactPreviewMode;
  onOpenTracking: () => void;
}) {
  const brand = item.brand_name ?? item.program_name ?? "Partner offer";
  const title = item.title ?? "Special offer";
  const discount = item.discount_percent != null
    ? `${item.discount_percent}% off`
    : item.discount_amount != null
      ? `${item.discount_currency ?? ""}${item.discount_amount} off`
      : null;
  const ctaLabel = item.tracking_url ? `Shop ${brand}` : "Affiliate link unavailable";

  return (
    <View style={[
      styles.impactPreviewMock,
      mode === "fantasy_weekly"
        ? styles.impactPreviewMockFantasy
        : styles.impactPreviewMockGameDay,
    ]}>
      <View style={styles.impactPreviewMockTopline}>
        <Text style={styles.impactPreviewMockEyebrow}>
          {mode === "fantasy_weekly" ? "WEEKLY BONUS" : "GAME DAY OFFER"}
        </Text>
        <Text style={styles.impactPreviewMockPreviewLabel}>PREVIEW</Text>
      </View>

      {mode === "game_day" && item.creative_url && (
        <Image
          source={{ uri: impactCreativeSource(item.creative_url) }}
          style={styles.impactPreviewCreative}
          resizeMode="contain"
        />
      )}

      <View style={styles.impactPreviewMockBody}>
        <Text style={styles.impactPreviewBrand}>{brand}</Text>
        <Text style={styles.impactPreviewTitle}>{title}</Text>
        {item.description && (
          <Text style={styles.impactPreviewDescription}>{item.description}</Text>
        )}

        <View style={styles.impactPreviewMetaRow}>
          {discount && <Text style={styles.impactPreviewMeta}>{discount}</Text>}
          {item.discount_type && !discount && (
            <Text style={styles.impactPreviewMeta}>{item.discount_type}</Text>
          )}
          {item.promo_code && (
            <Text style={styles.impactPreviewCode}>Code: {item.promo_code}</Text>
          )}
        </View>

        <Pressable
          style={[styles.impactPreviewCta, !item.tracking_url && styles.impactPreviewCtaDisabled]}
          onPress={onOpenTracking}
          disabled={!item.tracking_url}
        >
          <Text style={styles.impactPreviewCtaText}>{ctaLabel}</Text>
          {item.tracking_url && <Ionicons name="arrow-forward" size={15} color="#000" />}
        </Pressable>

        <Text style={styles.impactPreviewDisclosure}>
          Affiliate disclosure: Swayger may earn a commission if you use this link.
        </Text>
      </View>
    </View>
  );
}

export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const router = useRouter();

  const [token, setToken] = useState("");
  const [tokenVisible, setTokenVisible] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [tokenValidating, setTokenValidating] = useState(false);
  const [savedToken, setSavedToken] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(true);

  // Create night form
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [lockTimeCDT, setLockTimeCDT] = useState(DEFAULT_CDT_TIME);
  const [sport, setSport] = useState<string>("NBA");
  const [questions, setQuestions] = useState<string[]>(["", ""]);
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState<string | null>(null);

  // Open nights
  const [nights, setNights] = useState<Night[]>([]);
  const [nightsLoading, setNightsLoading] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const [pendingResults, setPendingResults] = useState<Record<string, Record<string, "over" | "under" | "voided">>>({});

  // Legacy Global Settlement (hidden unless LEGACY_GS_ENABLED)
  const [gsSport, setGsSport] = useState<"nba" | "soccer">("nba");
  const [gsTemplProps, setGsTemplProps] = useState<any[]>([]);
  const [gsTemplLoading, setGsTemplLoading] = useState(false);
  const [gsSelectedProp, setGsSelectedProp] = useState<any | null>(null);
  const [gsAnswer, setGsAnswer] = useState<string | null>(null);
  const [gsPreview, setGsPreview] = useState<{ props_count: number; rooms_count: number; picks_count: number; rooms: { room_code: string; room_name: string }[] } | null>(null);
  const [gsPreviewLoading, setGsPreviewLoading] = useState(false);
  const [gsSettling, setGsSettling] = useState(false);
  const [gsMsg, setGsMsg] = useState<string | null>(null);

  // Settlement Queue (new grouped settlement preview)
  const [sqQueue, setSqQueue] = useState<SQQueue | null>(null);
  const [sqLoading, setSqLoading] = useState(false);
  const [sqError, setSqError] = useState<string | null>(null);
  const [sqExpandedEvent, setSqExpandedEvent] = useState<string | null>(null);
  const [sqExpandedGroup, setSqExpandedGroup] = useState<string | null>(null);

  // Global Settlement write-path state (Milestone 2)
  const [sqSettleTarget, setSqSettleTarget] = useState<{ event: SQEvent; group: SQGroup } | null>(null);
  const [sqSettleAnswer, setSqSettleAnswer] = useState<string | null>(null);
  const [sqSettleSubmitting, setSqSettleSubmitting] = useState(false);
  const [sqSettleResult, setSqSettleResult] = useState<{ ok: boolean; message: string; refresh_required?: boolean } | null>(null);

  // Impact Commercial Review and persisted Swayger Offer workflow.
  const [impactReview, setImpactReview] = useState<ImpactReviewResponse | null>(null);
  const [impactReviewLoading, setImpactReviewLoading] = useState(false);
  const [impactReviewError, setImpactReviewError] = useState<string | null>(null);
  const [impactAdType, setImpactAdType] = useState<ImpactReviewAdType | null>(null);
  const [impactKeyword, setImpactKeyword] = useState("");
  const [impactShortlisted, setImpactShortlisted] = useState<Set<string>>(new Set());
  const [impactPreviewItem, setImpactPreviewItem] = useState<ImpactReviewItem | null>(null);
  const [impactPreviewMode, setImpactPreviewMode] = useState<ImpactPreviewMode>("game_day");
  const [impactFullLoading, setImpactFullLoading] = useState(false);
  const [impactFullSummary, setImpactFullSummary] = useState<{ ads: number; deals: number; fetched_at: string } | null>(null);
  const [impactFullError, setImpactFullError] = useState<string | null>(null);
  const [commercialOffers, setCommercialOffers] = useState<CommercialOffer[]>([]);
  const [commercialAssignments, setCommercialAssignments] = useState<CommercialAssignment[]>([]);
  const [commercialTargets, setCommercialTargets] = useState<CommercialTarget[]>([]);
  const [commercialTargetType, setCommercialTargetType] = useState<CommercialTargetType>("game_day");
  const [commercialTargetPickerOfferId, setCommercialTargetPickerOfferId] = useState<string | null>(null);
  const [commercialLoading, setCommercialLoading] = useState(false);
  const [commercialError, setCommercialError] = useState<string | null>(null);
  const [commercialPreviewTarget, setCommercialPreviewTarget] = useState<string | null>(null);

  // Prop Library
  const [libSport, setLibSport] = useState<"nba" | "soccer">("nba");
  const [libProps, setLibProps] = useState<any[]>([]);
  const [libLoading, setLibLoading] = useState(false);
  const [libTogglingId, setLibTogglingId] = useState<string | null>(null);
  const [showAddProp, setShowAddProp] = useState(false);
  const [newPropId, setNewPropId] = useState("");
  const [newPropPhase, setNewPropPhase] = useState("");
  const [newPropQuestion, setNewPropQuestion] = useState("");
  const [newPropAnswers, setNewPropAnswers] = useState("");
  const [newPropWindow, setNewPropWindow] = useState("");
  const [addingProp, setAddingProp] = useState(false);
  const [addPropMsg, setAddPropMsg] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem(ADMIN_TOKEN_KEY).then((t) => {
      setSavedToken(t);
      setTokenLoading(false);
      if (t) {
        loadNights(t);
        loadPropLibrary(t, libSport);
        loadSettlementQueue(t);
        loadImpactReview(t);
        loadCommercialWorkflow(t);
        if (LEGACY_GS_ENABLED) loadGsTemplProps(t, gsSport);
      }
    });
  }, []));

  /** POST /api/admin/gameday/settle-group — called from the confirmation modal. */
  async function handleSettleConfirm() {
    if (!sqSettleTarget || !sqSettleAnswer || !savedToken || sqSettleSubmitting) return;
    setSqSettleSubmitting(true);
    setSqSettleResult(null);

    const { event: ev, group: grp } = sqSettleTarget;

    // The canonical normalized form comes from the answer_map already computed
    // server-side — no need to re-run client-side normalization.
    const answerEntry = grp.answer_map.find((e) => e.stored === sqSettleAnswer);
    const canonicalNormalized = answerEntry?.normalized ?? sqSettleAnswer.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

    // One-time idempotency key — prevents double-settlement on accidental double-tap.
    const idempotencyKey = `${ev.event_key ?? "legacy"}-${grp.group_key.slice(-12)}-${Date.now().toString(36)}`;

    try {
      const url = new URL("/api/admin/gameday/settle-group", getApiUrl());
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": savedToken },
        body: JSON.stringify({
          group_key: grp.group_key,
          prop_ids: grp.prop_ids,
          expected_count: grp.prop_count,
          canonical_answer_normalized: canonicalNormalized,
          idempotency_key: idempotencyKey,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setSqSettleResult({
          ok: true,
          message: `✓ Settled ${json.settled_count} props across ${json.rooms_count} rooms.\nOp: ${json.operation_id}`,
        });
        // Refresh queue and auto-close sheet after brief success pause.
        setTimeout(() => {
          setSqSettleTarget(null);
          setSqSettleAnswer(null);
          setSqSettleResult(null);
          loadSettlementQueue(savedToken!);
        }, 2200);
      } else {
        setSqSettleResult({
          ok: false,
          message: json.error ?? "Settlement failed.",
          refresh_required: json.refresh_required,
        });
      }
    } catch (e) {
      setSqSettleResult({ ok: false, message: String(e) });
    } finally {
      setSqSettleSubmitting(false);
    }
  }

  async function loadSettlementQueue(t: string) {
    setSqLoading(true);
    setSqError(null);
    try {
      const url = new URL("/api/admin/gameday/settlement-queue", getApiUrl());
      const res = await fetch(url.toString(), { headers: { "x-admin-token": t } });
      const json = await res.json();
      if (json.ok) {
        setSqQueue(json as SQQueue);
      } else {
        setSqError(json.error ?? "Failed to load queue.");
      }
    } catch (e) {
      setSqError(String(e));
    } finally {
      setSqLoading(false);
    }
  }

  async function loadPropLibrary(t: string, sport: "nba" | "soccer") {
    setLibLoading(true);
    try {
      const url = new URL(`/api/admin/gameday/prop-library?sport=${sport}`, getApiUrl());
      const res = await fetch(url.toString(), { headers: { "x-admin-token": t } });
      const json = await res.json();
      if (json.ok) setLibProps(json.props ?? []);
    } catch { /* ignore */ } finally {
      setLibLoading(false);
    }
  }

  async function handleTogglePropActive(propId: string, currentActive: boolean) {
    if (!savedToken) return;
    setLibTogglingId(propId);
    try {
      const url = new URL(`/api/admin/gameday/prop-library/${propId}`, getApiUrl());
      const res = await fetch(url.toString(), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-token": savedToken },
        body: JSON.stringify({ is_active: !currentActive }),
      });
      const json = await res.json();
      if (json.ok) {
        setLibProps((prev) => prev.map((p) => p.id === propId ? { ...p, is_active: !currentActive } : p));
      }
    } catch { /* ignore */ } finally {
      setLibTogglingId(null);
    }
  }

  async function handleAddProp() {
    if (!savedToken || !newPropId.trim() || !newPropPhase.trim() || !newPropQuestion.trim() || !newPropAnswers.trim()) {
      setAddPropMsg("❌ Fill in ID, phase, question, and answers.");
      return;
    }
    let parsedAnswers: string[];
    try {
      parsedAnswers = newPropAnswers.split("|").map((s) => s.trim()).filter(Boolean);
      if (parsedAnswers.length < 2) throw new Error("Need at least 2 answers");
    } catch {
      setAddPropMsg("❌ Answers: separate with | (e.g. Yes | No)");
      return;
    }
    setAddingProp(true);
    setAddPropMsg(null);
    try {
      const url = new URL("/api/admin/gameday/prop-library", getApiUrl());
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": savedToken },
        body: JSON.stringify({
          id: newPropId.trim().toLowerCase().replace(/\s+/g, "_"),
          sport: libSport,
          phase: newPropPhase.trim().toLowerCase(),
          question: newPropQuestion.trim(),
          answer_options: parsedAnswers,
          settlement_window: newPropWindow.trim(),
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setAddPropMsg("✅ Prop added.");
        setNewPropId(""); setNewPropPhase(""); setNewPropQuestion("");
        setNewPropAnswers(""); setNewPropWindow("");
        setShowAddProp(false);
        loadPropLibrary(savedToken, libSport);
      } else {
        setAddPropMsg(`❌ ${json.error}`);
      }
    } catch (e) {
      setAddPropMsg(`❌ ${String(e)}`);
    } finally {
      setAddingProp(false);
    }
  }

  async function loadGsTemplProps(t: string, sport: "nba" | "soccer") {
    setGsTemplLoading(true);
    setGsSelectedProp(null);
    setGsAnswer(null);
    setGsPreview(null);
    setGsMsg(null);
    try {
      const url = new URL(`/api/admin/gameday/prop-library?sport=${sport}`, getApiUrl());
      const res = await fetch(url.toString(), { headers: { "x-admin-token": t } });
      const json = await res.json();
      if (json.ok) setGsTemplProps((json.props ?? []).filter((p: any) => p.is_active));
    } catch { /* ignore */ } finally {
      setGsTemplLoading(false);
    }
  }

  async function loadGsPreview(propId: string, answer: string) {
    if (!savedToken) return;
    setGsPreviewLoading(true);
    setGsPreview(null);
    setGsMsg(null);
    try {
      const url = new URL(
        `/api/admin/gameday/global-settle/preview?template_prop_id=${encodeURIComponent(propId)}&correct_answer=${encodeURIComponent(answer)}`,
        getApiUrl()
      );
      const res = await fetch(url.toString(), { headers: { "x-admin-token": savedToken } });
      const json = await res.json();
      if (json.ok) setGsPreview(json);
      else setGsMsg(`❌ ${json.error}`);
    } catch (e) {
      setGsMsg(`❌ ${String(e)}`);
    } finally {
      setGsPreviewLoading(false);
    }
  }

  async function handleGlobalSettle() {
    if (!savedToken || !gsSelectedProp || !gsAnswer || !gsPreview) return;
    if (gsPreview.props_count === 0) { setGsMsg("Nothing to settle."); return; }
    setGsSettling(true);
    setGsMsg(null);
    try {
      const url = new URL("/api/admin/gameday/global-settle", getApiUrl());
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": savedToken },
        body: JSON.stringify({ template_prop_id: gsSelectedProp.id, correct_answer: gsAnswer }),
      });
      const json = await res.json();
      if (json.ok) {
        setGsMsg(`✅ Settled ${json.settled} prop${json.settled === 1 ? "" : "s"} across ${json.rooms_count} room${json.rooms_count === 1 ? "" : "s"}.`);
        setGsSelectedProp(null);
        setGsAnswer(null);
        setGsPreview(null);
      } else {
        setGsMsg(`❌ ${json.error}`);
      }
    } catch (e) {
      setGsMsg(`❌ ${String(e)}`);
    } finally {
      setGsSettling(false);
    }
  }

  async function saveToken() {
    const t = token.trim();
    if (!t) return;
    setTokenError(null);
    setTokenValidating(true);
    try {
      const url = new URL("/api/admin/gameday/prop-library?sport=nba", getApiUrl());
      const res = await fetch(url.toString(), { headers: { "x-admin-token": t } });
      const json = await res.json();
      if (!json.ok) {
        setTokenError("Incorrect token. Check MM_ADMIN_TOKEN in Replit Secrets.");
        return;
      }
    } catch {
      setTokenError("Could not reach the server. Try again.");
      return;
    } finally {
      setTokenValidating(false);
    }
    await AsyncStorage.setItem(ADMIN_TOKEN_KEY, t);
    setSavedToken(t);
    loadNights(t);
    loadPropLibrary(t, libSport);
    loadSettlementQueue(t);
    loadImpactReview(t);
    loadCommercialWorkflow(t);
    if (LEGACY_GS_ENABLED) loadGsTemplProps(t, gsSport);
  }

  async function clearToken() {
    await AsyncStorage.removeItem(ADMIN_TOKEN_KEY);
    setSavedToken(null);
    setNights([]);
    setImpactReview(null);
    setImpactFullSummary(null);
    setImpactShortlisted(new Set());
    setImpactPreviewItem(null);
    setCommercialOffers([]);
    setCommercialAssignments([]);
    setCommercialTargets([]);
    setCommercialTargetPickerOfferId(null);
  }

  async function loadImpactReview(
    t: string,
    nextAdType: ImpactReviewAdType | null = impactAdType,
    nextKeyword: string = impactKeyword,
  ) {
    setImpactReviewLoading(true);
    setImpactReviewError(null);
    try {
      const url = new URL("/api/admin/impact/review", getApiUrl());
      const safeAdType = normalizeImpactReviewAdType(nextAdType);
      const safeKeyword = normalizeImpactReviewKeyword(nextKeyword);
      url.searchParams.set("updated_within_days", String(IMPACT_REVIEW_DEFAULT_UPDATED_WITHIN_DAYS));
      if (safeAdType) url.searchParams.set("ad_type", safeAdType);
      if (safeKeyword) url.searchParams.set("keyword", safeKeyword);
      const res = await fetch(url.toString(), { headers: { "x-admin-token": t } });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        if (res.status === 400 || json.code === "IMPACT_REVIEW_QUERY_INVALID") {
          setImpactReviewError(`Review filter error: ${json.error ?? "Choose a supported ad type and a keyword of 100 characters or fewer."}`);
        } else if (json.code === "IMPACT_PROVIDER_ERROR" || res.status >= 502) {
          setImpactReviewError(`Impact provider error: ${json.error ?? "Impact could not return the review inventory."}`);
        } else if (res.status === 401) {
          setImpactReviewError("Admin authorization expired. Unlock the admin screen again.");
        } else {
          setImpactReviewError(json.error ?? "Could not load Impact review.");
        }
        return;
      }
      setImpactReview(json as ImpactReviewResponse);
    } catch {
      setImpactReviewError("Could not reach the Impact review endpoint.");
    } finally {
      setImpactReviewLoading(false);
    }
  }

  async function loadFullImpactInventory() {
    if (!savedToken || impactFullLoading) return;
    setImpactFullLoading(true);
    setImpactFullError(null);
    try {
      const url = new URL("/api/admin/impact/inventory", getApiUrl());
      const res = await fetch(url.toString(), { headers: { "x-admin-token": savedToken } });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setImpactFullError(json.error ?? "Could not load the full inventory.");
        return;
      }
      setImpactFullSummary({
        ads: json.totals?.ads ?? 0,
        deals: json.totals?.deals ?? 0,
        fetched_at: json.fetched_at,
      });
    } catch {
      setImpactFullError("Could not reach the full inventory endpoint.");
    } finally {
      setImpactFullLoading(false);
    }
  }

  async function loadCommercialWorkflow(t: string) {
    setCommercialLoading(true);
    setCommercialError(null);
    try {
      const [offers, assignments] = await Promise.all([
        listCommercialOffers(t),
        listCommercialAssignments(t),
      ]);
      setCommercialOffers(offers);
      setCommercialAssignments(assignments);
    } catch (error) {
      setCommercialError(error instanceof Error ? error.message : "Could not load saved Swayger Offers.");
    } finally {
      setCommercialLoading(false);
    }
  }

  async function loadCommercialTargets(type: CommercialTargetType) {
    if (!savedToken) return;
    setCommercialTargetType(type);
    setCommercialError(null);
    try {
      setCommercialTargets(await listCommercialTargets(savedToken, type));
    } catch (error) {
      setCommercialError(error instanceof Error ? error.message : "Could not load eligible targets.");
    }
  }

  function offerKey(item: Pick<ImpactReviewItem, "resource_type" | "program_id" | "external_id" | "title">) {
    return `${item.resource_type}:${item.program_id ?? "unknown"}:${item.external_id ?? item.title ?? "item"}`;
  }

  function savedCommercialOffer(item: ImpactReviewItem) {
    return commercialOffers.find((offer) => offerKey({
      resource_type: offer.resource_type,
      program_id: offer.program_id,
      external_id: offer.external_id,
      title: offer.title,
    }) === offerKey(item));
  }

  async function saveImpactOffer(item: ImpactReviewItem) {
    if (!savedToken) return;
    setCommercialError(null);
    try {
      const saved = await saveCommercialOffer(savedToken, item);
      setCommercialOffers((previous) => [
        saved,
        ...previous.filter((offer) => offer.id !== saved.id),
      ]);
    } catch (error) {
      setCommercialError(error instanceof Error ? error.message : "Could not save the Swayger Offer.");
    }
  }

  async function assignOfferToTarget(offerId: string, target: CommercialTarget) {
    if (!savedToken) return;
    setCommercialError(null);
    try {
      const assignment = await assignCommercialOffer(
        savedToken,
        offerId,
        target.target_type,
        target.target_id,
      );
      setCommercialAssignments((previous) => [
        assignment,
        ...previous.filter((item) => item.id !== assignment.id),
      ]);
      setCommercialTargetPickerOfferId(null);
      setCommercialTargets((previous) => previous.map((item) =>
        item.target_id === target.target_id
          ? { ...item, published_assignment: item.published_assignment ?? null }
          : item
      ));
    } catch (error) {
      setCommercialError(error instanceof Error ? error.message : "Could not assign the Swayger Offer.");
    }
  }

  async function setAssignmentPublished(assignment: CommercialAssignment, publish: boolean) {
    if (!savedToken) return;
    if (publish && Platform.OS === "web" && typeof window !== "undefined" && !window.confirm(
      "Publish this Featured Offer to the selected participant-facing target?",
    )) return;
    setCommercialError(null);
    try {
      const updated = await publishCommercialAssignment(savedToken, assignment.id, publish);
      setCommercialAssignments((previous) => previous.map((item) => item.id === updated.id ? updated : item));
      setCommercialTargets((previous) => previous.map((target) =>
        target.target_id === updated.target_id
          ? {
            ...target,
            published_assignment: updated.status === "published"
              ? { id: updated.id, offer_id: updated.offer_id, status: "published" }
              : null,
          }
          : target
      ));
    } catch (error) {
      setCommercialError(error instanceof Error ? error.message : "Could not update the assignment.");
    }
  }

  function offerAsImpactItem(offer: CommercialOffer): ImpactReviewItem {
    return {
      provider: "impact",
      program_id: offer.program_id,
      program_name: offer.program_name,
      brand_id: offer.brand_id,
      brand_name: offer.brand_name,
      resource_type: offer.resource_type,
      external_id: offer.external_id,
      title: offer.title,
      description: offer.description,
      status: offer.status ?? "saved",
      availability: offer.availability as ImpactReviewItem["availability"],
      start_at: offer.start_at,
      end_at: offer.end_at,
      promo_code: offer.promo_code,
      discount_type: offer.discount_type,
      discount_amount: offer.discount_amount,
      discount_currency: offer.discount_currency,
      discount_percent: offer.discount_percent,
      minimum_purchase_amount: offer.minimum_purchase_amount,
      maximum_savings_amount: offer.maximum_savings_amount,
      tracking_url: offer.tracking_url,
      landing_page_url: offer.landing_page_url,
      creative_url: offer.creative_url,
      creative_type: offer.creative_type,
      creative_width: offer.creative_width,
      creative_height: offer.creative_height,
      source_updated_at: offer.source_updated_at,
      fetched_at: offer.source_updated_at ?? new Date().toISOString(),
    };
  }

  function openCommercialAssignmentPreview(assignment: CommercialAssignment) {
    if (!assignment.offer) return;
    setImpactPreviewMode(assignment.target_type === "fantasy_weekly" ? "fantasy_weekly" : "game_day");
    setCommercialPreviewTarget(assignment.target?.room_name ?? assignment.target_id);
    setImpactPreviewItem(offerAsImpactItem(assignment.offer));
  }

  function toggleImpactShortlist(item: ImpactReviewItem) {
    const key = `${item.resource_type}:${item.program_id ?? "unknown"}:${item.external_id ?? item.title ?? "item"}`;
    setImpactShortlisted((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function isImpactShortlisted(item: ImpactReviewItem) {
    const key = `${item.resource_type}:${item.program_id ?? "unknown"}:${item.external_id ?? item.title ?? "item"}`;
    return impactShortlisted.has(key);
  }

  function openImpactPreview(item: ImpactReviewItem) {
    setImpactPreviewMode("game_day");
    setCommercialPreviewTarget(null);
    setImpactPreviewItem(item);
  }

  function openImpactTrackingLink() {
    const trackingUrl = impactPreviewItem?.tracking_url;
    if (trackingUrl) void Linking.openURL(trackingUrl);
  }

  async function loadNights(t: string) {
    setNightsLoading(true);
    try {
      const url = new URL("/api/admin/props/open-nights", getApiUrl());
      const res = await fetch(url.toString(), { headers: { "x-admin-token": t } });
      const json = await res.json();
      if (json.ok) setNights(json.nights ?? []);
    } catch { /* ignore */ } finally {
      setNightsLoading(false);
    }
  }

  function updateDate(d: string) {
    setDate(d);
  }

  function setQuestion(i: number, v: string) {
    setQuestions((prev) => prev.map((q, idx) => idx === i ? v : q));
  }

  function addQuestion() {
    if (questions.length < 4) setQuestions((p) => [...p, ""]);
  }

  function removeQuestion(i: number) {
    if (questions.length <= 1) return;
    setQuestions((p) => p.filter((_, idx) => idx !== i));
  }

  async function handleCreateNight() {
    const validQs = questions.filter((q) => q.trim().length > 0);
    if (!date || validQs.length === 0) {
      Alert.alert("Missing fields", "Enter a date and at least one question.");
      return;
    }
    setCreating(true);
    setCreateMsg(null);
    try {
      const url = new URL("/api/admin/props/manual-night", getApiUrl());
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": savedToken! },
        body: JSON.stringify({ date, lock_time: cdtTimeToISO(date, lockTimeCDT), questions: validQs, sport }),
      });
      const json = await res.json();
      if (json.ok) {
        setCreateMsg(`✅ Night created: ${json.id.slice(0, 8)}…`);
        setQuestions(["", ""]);
        loadNights(savedToken!);
      } else {
        setCreateMsg(`❌ ${json.error}`);
      }
    } catch (e) {
      setCreateMsg(`❌ ${String(e)}`);
    } finally {
      setCreating(false);
    }
  }

  function setPropResult(nightId: string, propId: string, result: "over" | "under" | "voided") {
    setPendingResults((prev) => ({
      ...prev,
      [nightId]: { ...(prev[nightId] ?? {}), [propId]: result },
    }));
  }

  async function handleResolveNight(night: Night) {
    const results = pendingResults[night.id] ?? {};
    const activeProps = night.props.filter((p) => p.status !== "voided");
    const unresolved = activeProps.filter((p) => !results[p.id]);
    if (unresolved.length > 0) {
      Alert.alert(
        "Missing results",
        `Set a result for all ${activeProps.length} props before resolving.`,
      );
      return;
    }
    setResolving(night.id);
    try {
      const url = new URL(`/api/admin/props/manual-resolve/${night.id}`, getApiUrl());
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": savedToken! },
        body: JSON.stringify({ results }),
      });
      const json = await res.json();
      if (json.ok) {
        Alert.alert("Resolved ✅", `${json.picksScored} user picks scored.`);
        setPendingResults((prev) => { const n = { ...prev }; delete n[night.id]; return n; });
        loadNights(savedToken!);
      } else {
        Alert.alert("Error", json.error);
      }
    } catch (e) {
      Alert.alert("Error", String(e));
    } finally {
      setResolving(null);
    }
  }

  if (tokenLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: isWeb ? 67 : insets.top }]}>
        <ActivityIndicator color={NBA_GOLD} />
      </View>
    );
  }

  if (!savedToken) {
    return (
      <View style={[styles.container, { paddingTop: isWeb ? 67 : insets.top }]}>
        <View style={styles.tokenScreen}>
          <Ionicons name="shield-checkmark-outline" size={40} color={NBA_GOLD} />
          <Text style={styles.tokenTitle}>Admin Access</Text>
          <Text style={styles.tokenSub}>Enter your admin token to continue.</Text>
          <View style={styles.tokenInputRow}>
            <TextInput
              style={styles.tokenInputInner}
              placeholder="Admin token"
              placeholderTextColor={Colors.dark.tabIconDefault}
              value={token}
              onChangeText={(v) => { setToken(v); setTokenError(null); }}
              secureTextEntry={!tokenVisible}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable onPress={() => setTokenVisible((v) => !v)} style={styles.tokenEyeBtn}>
              <Ionicons
                name={tokenVisible ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={Colors.dark.tabIconDefault}
              />
            </Pressable>
          </View>
          {tokenError && (
            <Text style={styles.tokenErrorText}>{tokenError}</Text>
          )}
          <Pressable
            style={[styles.primaryBtn, tokenValidating && { opacity: 0.6 }]}
            onPress={saveToken}
            disabled={tokenValidating}
          >
            {tokenValidating
              ? <ActivityIndicator size="small" color="#000" />
              : <Text style={styles.primaryBtnText}>Unlock</Text>
            }
          </Pressable>
          <Pressable style={styles.backLink} onPress={() => router.back()}>
            <Text style={styles.backLinkText}>← Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { paddingTop: isWeb ? 67 : insets.top }]}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.pageTitle}>Props Admin</Text>
        <Pressable onPress={clearToken} style={styles.lockBtn}>
          <Ionicons name="lock-closed-outline" size={16} color={Colors.dark.tabIconDefault} />
        </Pressable>
      </View>

      {/* ── Create Manual Night ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>New Prediction Night</Text>
        <Text style={styles.sectionSub}>Create yes/no questions for an off-day or any night.</Text>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Date</Text>
          <TextInput
            style={styles.input}
            value={date}
            onChangeText={updateDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={Colors.dark.tabIconDefault}
            autoCapitalize="none"
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Lock Time (CDT)</Text>
          <TextInput
            style={styles.input}
            value={lockTimeCDT}
            onChangeText={setLockTimeCDT}
            placeholder="e.g. 7:30 PM"
            placeholderTextColor={Colors.dark.tabIconDefault}
            autoCapitalize="none"
          />
          <Text style={styles.hint}>Enter time in CDT — e.g. "5:45 PM" or "8:00 PM"</Text>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Sport</Text>
          <View style={styles.sportRow}>
            {SPORT_OPTIONS.map((s) => {
              const active = sport === s;
              const color = SPORT_COLORS[s];
              return (
                <Pressable
                  key={s}
                  style={[styles.sportBtn, active && { borderColor: color, backgroundColor: color + "18" }]}
                  onPress={() => setSport(s)}
                >
                  <Text style={[styles.sportBtnText, active && { color }]}>{s}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Prediction Questions</Text>
          {questions.map((q, i) => (
            <View key={i} style={styles.questionRow}>
              <TextInput
                style={[styles.input, styles.questionInput]}
                value={q}
                onChangeText={(v) => setQuestion(i, v)}
                placeholder={`Question ${i + 1}…`}
                placeholderTextColor={Colors.dark.tabIconDefault}
              />
              {questions.length > 1 && (
                <Pressable onPress={() => removeQuestion(i)} style={styles.removeBtn}>
                  <Ionicons name="close-circle" size={20} color={Colors.dark.danger} />
                </Pressable>
              )}
            </View>
          ))}
          {questions.length < 4 && (
            <Pressable style={styles.addQuestionBtn} onPress={addQuestion}>
              <Ionicons name="add-circle-outline" size={16} color={Colors.dark.tint} />
              <Text style={styles.addQuestionText}>Add question</Text>
            </Pressable>
          )}
        </View>

        <Pressable
          style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.8 }, creating && { opacity: 0.5 }]}
          onPress={handleCreateNight}
          disabled={creating}
        >
          {creating
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.primaryBtnText}>Create Night →</Text>}
        </Pressable>

        {createMsg && <Text style={styles.createMsg}>{createMsg}</Text>}
      </View>

      {/* ── Open Nights ── */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Open Nights</Text>
          <Pressable onPress={() => loadNights(savedToken)} style={styles.refreshBtn}>
            <Ionicons name="refresh" size={16} color={Colors.dark.tint} />
          </Pressable>
        </View>

        {nightsLoading ? (
          <ActivityIndicator color={NBA_GOLD} style={{ marginTop: 16 }} />
        ) : nights.length === 0 ? (
          <Text style={styles.emptyText}>No open nights right now.</Text>
        ) : (
          nights.map((night) => {
            const pending = pendingResults[night.id] ?? {};
            const activeProps = night.props.filter((p) => p.status !== "voided");
            const allSet = activeProps.every((p) => !!pending[p.id]);

            return (
              <View key={night.id} style={styles.nightCard}>
                <View style={styles.nightCardHeader}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={styles.nightDate}>{formatDate(night.date)}</Text>
                    {night.sport && (
                      <View style={[styles.sportBadge, { borderColor: (SPORT_COLORS[night.sport] || "#6B7280") + "55", backgroundColor: (SPORT_COLORS[night.sport] || "#6B7280") + "18" }]}>
                        <Text style={[styles.sportBadgeText, { color: SPORT_COLORS[night.sport] || "#6B7280" }]}>{night.sport}</Text>
                      </View>
                    )}
                  </View>
                  <View style={[styles.statusPill, night.status === "locked" && styles.statusPillLocked]}>
                    <Text style={styles.statusPillText}>{night.status.toUpperCase()}</Text>
                  </View>
                </View>
                <Text style={styles.nightLock}>Locks {formatLock(night.lock_time)}</Text>

                {activeProps.map((prop) => {
                  const isManual = prop.stat === "yn";
                  const result = pending[prop.id];
                  return (
                    <View key={prop.id} style={styles.propRow}>
                      <Text style={styles.propQuestion} numberOfLines={2}>
                        {isManual ? prop.player_name : `${prop.player_name} ${prop.line} ${prop.stat}`}
                      </Text>
                      <View style={styles.resultBtns}>
                        <Pressable
                          style={[styles.resultBtn, result === "over" && styles.resultBtnYes]}
                          onPress={() => setPropResult(night.id, prop.id, "over")}
                        >
                          <Text style={[styles.resultBtnText, result === "over" && styles.resultBtnTextActive]}>
                            {isManual ? "YES" : "OVER"}
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[styles.resultBtn, result === "under" && styles.resultBtnNo]}
                          onPress={() => setPropResult(night.id, prop.id, "under")}
                        >
                          <Text style={[styles.resultBtnText, result === "under" && styles.resultBtnTextActive]}>
                            {isManual ? "NO" : "UNDER"}
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[styles.resultBtn, result === "voided" && styles.resultBtnVoid]}
                          onPress={() => setPropResult(night.id, prop.id, "voided")}
                        >
                          <Text style={[styles.resultBtnText, result === "voided" && styles.resultBtnTextActive]}>
                            VOID
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}

                <Pressable
                  style={({ pressed }) => [
                    styles.resolveBtn,
                    !allSet && styles.resolveBtnDisabled,
                    pressed && allSet && { opacity: 0.85 },
                  ]}
                  onPress={() => handleResolveNight(night)}
                  disabled={!allSet || resolving === night.id}
                >
                  {resolving === night.id
                    ? <ActivityIndicator color="#fff" size="small" />
                    : (
                      <>
                        <Ionicons name="checkmark-circle" size={16} color="#fff" />
                        <Text style={styles.resolveBtnText}>Resolve & Score All Picks</Text>
                      </>
                    )}
                </Pressable>
              </View>
            );
          })
        )}
      </View>

      {/* ── Settlement Queue (new grouped preview) ── */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>Settlement Queue</Text>
            <Text style={styles.sectionSub}>
              Locked props grouped by game and question. Read-only preview.
            </Text>
          </View>
          <Pressable
            onPress={() => savedToken && loadSettlementQueue(savedToken)}
            style={styles.refreshBtn}
          >
            <Ionicons name="refresh" size={16} color={Colors.dark.tint} />
          </Pressable>
        </View>

        {sqLoading && <ActivityIndicator color={NBA_GOLD} style={{ marginVertical: 8 }} />}

        {sqError && (
          <Text style={[styles.createMsg, { color: "#F87171" }]}>⚠ {sqError}</Text>
        )}

        {!sqLoading && !sqError && sqQueue && sqQueue.total_props === 0 && (
          <Text style={styles.emptyText}>
            No locked unsettled props in active rooms right now.
          </Text>
        )}

        {!sqLoading && !sqError && sqQueue && sqQueue.total_props > 0 && (
          <View style={{ gap: 8 }}>
            {/* Summary bar — safe / review / manual counts */}
            <View style={styles.sqSummaryBar}>
              {sqQueue.total_safe > 0 && (
                <View style={styles.sqStatusChip}>
                  <View style={[styles.sqStatusDot, { backgroundColor: "#34D399" }]} />
                  <Text style={styles.sqSummaryText}>{sqQueue.total_safe} safe</Text>
                </View>
              )}
              {sqQueue.total_review > 0 && (
                <View style={styles.sqStatusChip}>
                  <View style={[styles.sqStatusDot, { backgroundColor: "#FBBF24" }]} />
                  <Text style={styles.sqSummaryText}>{sqQueue.total_review} review</Text>
                </View>
              )}
              {sqQueue.total_manual > 0 && (
                <View style={styles.sqStatusChip}>
                  <View style={[styles.sqStatusDot, { backgroundColor: "#9CA3AF" }]} />
                  <Text style={styles.sqSummaryText}>{sqQueue.total_manual} manual</Text>
                </View>
              )}
              <Text style={styles.sqSummaryDot}>·</Text>
              <Text style={styles.sqSummaryText}>
                {sqQueue.total_props} prop{sqQueue.total_props !== 1 ? "s" : ""}
              </Text>
            </View>

            {/* Event cards */}
            {sqQueue.events.map((ev) => {
              const evKey = ev.event_key ?? ev.game_label;
              const isOpen = sqExpandedEvent === evKey;

              return (
                <View key={evKey} style={styles.sqEventCard}>
                  {/* Event header — tap to expand/collapse */}
                  <Pressable
                    style={styles.sqEventHeader}
                    onPress={() => setSqExpandedEvent(isOpen ? null : evKey)}
                  >
                    <View style={{ flex: 1, gap: 3 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        {ev.is_legacy && (
                          <View style={styles.sqLegacyBadge}>
                            <Text style={styles.sqLegacyBadgeText}>LEGACY</Text>
                          </View>
                        )}
                        <Text style={styles.sqEventLabel} numberOfLines={1}>
                          {ev.game_label}
                        </Text>
                      </View>
                      <Text style={styles.sqEventMeta}>
                        {ev.sport ? ev.sport.toUpperCase() + " · " : ""}
                        {ev.group_count} Q · {ev.prop_count} props
                        {ev.safe_count > 0 ? ` · ✓ ${ev.safe_count}` : ""}
                        {ev.review_count > 0 ? ` · ⚠ ${ev.review_count}` : ""}
                        {ev.manual_count > 0 ? ` · ⊘ ${ev.manual_count}` : ""}
                      </Text>
                    </View>
                    <Ionicons
                      name={isOpen ? "chevron-up" : "chevron-down"}
                      size={16}
                      color={Colors.dark.tabIconDefault}
                    />
                  </Pressable>

                  {/* Expanded group list */}
                  {isOpen && (
                    <View style={{ gap: 6, paddingBottom: 8 }}>
                      {ev.is_legacy && (
                        <View style={styles.sqLegacyNotice}>
                          <Ionicons name="information-circle-outline" size={14} color="#FBBF24" />
                          <Text style={styles.sqLegacyNoticeText}>
                            Missing sport or game date — cannot be bulk-settled. Settle each prop
                            individually from the host panel.
                          </Text>
                        </View>
                      )}

                      {ev.groups.map((grp) => {
                        const grpKey = grp.group_key;
                        const grpOpen = sqExpandedGroup === grpKey;

                        // Status color + label
                        const statusColor =
                          grp.settlement_status === "safe" ? "#34D399"
                          : grp.settlement_status === "review_required" ? "#FBBF24"
                          : "#9CA3AF";
                        const statusLabel =
                          grp.settlement_status === "safe" ? "Safe"
                          : grp.settlement_status === "review_required" ? "Review"
                          : "Manual only";
                        const statusIcon =
                          grp.settlement_status === "safe" ? "checkmark-circle-outline"
                          : grp.settlement_status === "review_required" ? "warning-outline"
                          : "ban-outline";

                        return (
                          <View key={grpKey} style={styles.sqGroupCard}>
                            {/* Group header — collapsed: status + phase + question + counts */}
                            <Pressable
                              style={styles.sqGroupHeader}
                              onPress={() => setSqExpandedGroup(grpOpen ? null : grpKey)}
                            >
                              <View style={{ flex: 1, gap: 4 }}>
                                {/* Pills row: phase + status */}
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                                  <View style={styles.sqPhasePill}>
                                    <Text style={styles.sqPhasePillText}>
                                      {grp.phase_label.toUpperCase()}
                                    </Text>
                                  </View>
                                  <View style={[styles.sqStatusBadge, { borderColor: statusColor + "50", backgroundColor: statusColor + "18" }]}>
                                    <Ionicons name={statusIcon as any} size={10} color={statusColor} />
                                    <Text style={[styles.sqStatusBadgeText, { color: statusColor }]}>
                                      {statusLabel}
                                    </Text>
                                  </View>
                                </View>
                                {/* Question — 2 lines max when collapsed */}
                                <Text style={styles.sqGroupQuestion} numberOfLines={grpOpen ? 0 : 2}>
                                  {grp.question}
                                </Text>
                                {/* Meta: counts only (lean collapsed) */}
                                <Text style={styles.sqGroupMeta}>
                                  {grp.prop_count} prop{grp.prop_count !== 1 ? "s" : ""} · {grp.room_count} room{grp.room_count !== 1 ? "s" : ""}
                                  {grp.template_consistency === "mixed" ? " · ⚠ mixed templates" : ""}
                                </Text>
                              </View>
                              <Ionicons
                                name={grpOpen ? "chevron-up" : "chevron-down"}
                                size={14}
                                color={Colors.dark.tabIconDefault}
                                style={{ marginTop: 2 }}
                              />
                            </Pressable>

                            {/* Expanded detail — shown only on tap */}
                            {grpOpen && (
                              <View style={{ gap: 10, paddingHorizontal: 12, paddingBottom: 12 }}>
                                {/* Conflict notices */}
                                {grp.conflicts.map((c, i) => (
                                  <View key={i} style={styles.sqConflictRow}>
                                    <Ionicons name="warning-outline" size={13} color="#FBBF24" />
                                    <Text style={styles.sqConflictText}>{c}</Text>
                                  </View>
                                ))}

                                {/* Answer map — the authoritative stored ↔ normalized mapping */}
                                <View style={{ gap: 6 }}>
                                  <Text style={styles.label}>Answer map (stored → normalized)</Text>
                                  {grp.answer_map.map((entry, i) => (
                                    <View key={i} style={styles.sqAnswerMapRow}>
                                      <View style={{ flex: 1 }}>
                                        <Text style={styles.sqAnswerMapStored}>{entry.stored}</Text>
                                        <Text style={styles.sqNormText}>→ {entry.normalized}</Text>
                                      </View>
                                      <Ionicons
                                        name={entry.round_trips ? "checkmark-circle" : "close-circle"}
                                        size={16}
                                        color={entry.round_trips ? "#34D399" : "#F87171"}
                                      />
                                    </View>
                                  ))}
                                </View>

                                {/* Template info (compact) */}
                                <View>
                                  <Text style={styles.label}>
                                    Templates · {grp.template_consistency}
                                  </Text>
                                  {[...new Set(grp.template_prop_ids)].map((tid, i) => (
                                    <Text key={i} style={styles.sqNormText}>{tid ?? "none"}</Text>
                                  ))}
                                </View>

                                {/* Prop IDs */}
                                <Text style={styles.sqNormText}>
                                  Props: {grp.prop_ids.slice(0, 5).map((id) => id.slice(0, 8)).join(" · ")}
                                  {grp.prop_ids.length > 5 ? ` +${grp.prop_ids.length - 5} more` : ""}
                                </Text>
                              </View>
                            )}

                            {/* ── Settle Group button (flag-gated, safe groups only) ── */}
                            {GLOBAL_SETTLEMENT_WRITE_ENABLED && grp.settlement_status === "safe" && (
                              <Pressable
                                style={styles.sqSettleBtn}
                                onPress={() => {
                                  setSqSettleTarget({ event: ev, group: grp });
                                  setSqSettleAnswer(null);
                                  setSqSettleResult(null);
                                }}
                              >
                                <Ionicons name="checkmark-done-circle" size={15} color="#000" />
                                <Text style={styles.sqSettleBtnText}>
                                  Settle {grp.prop_count} props across {grp.room_count} rooms
                                </Text>
                              </Pressable>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}

            <Text style={[styles.sqNormText, { textAlign: "center", marginTop: 2 }]}>
              {GLOBAL_SETTLEMENT_WRITE_ENABLED
                ? "Settle Group buttons visible on safe groups above."
                : "Read-only preview — settlement controls enabled after approval."}
            </Text>
          </View>
        )}
      </View>

      {/* ── Global Settlement Confirmation Modal ─────────────────────────── */}
      <Modal
        visible={sqSettleTarget !== null}
        transparent
        animationType="slide"
        onRequestClose={() => { if (!sqSettleSubmitting) { setSqSettleTarget(null); setSqSettleAnswer(null); setSqSettleResult(null); } }}
      >
        <View style={styles.sqModalOverlay}>
          <View style={styles.sqModalSheet}>
            {/* Handle bar */}
            <View style={styles.sqModalHandle} />

            {sqSettleTarget && (
              <>
                <Text style={styles.sqModalTitle}>Settle Group</Text>
                <Text style={styles.sqModalGameLabel}>{sqSettleTarget.event.game_label}</Text>

                <Text style={styles.sqModalQuestion}>{sqSettleTarget.group.question}</Text>
                <Text style={styles.sqModalMeta}>
                  {sqSettleTarget.group.prop_count} props · {sqSettleTarget.group.room_count} rooms · {sqSettleTarget.group.phase_label}
                </Text>

                {/* Answer option pills */}
                <View style={styles.sqModalOptionRow}>
                  {sqSettleTarget.group.answer_options.map((opt) => {
                    const selected = sqSettleAnswer === opt;
                    return (
                      <Pressable
                        key={opt}
                        style={[styles.sqModalOption, selected && styles.sqModalOptionSelected]}
                        onPress={() => { if (!sqSettleSubmitting) setSqSettleAnswer(opt); }}
                      >
                        <Text style={[styles.sqModalOptionText, selected && styles.sqModalOptionTextSelected]}>
                          {opt}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Result feedback */}
                {sqSettleResult && (
                  <Text style={[
                    styles.sqNormText,
                    { color: sqSettleResult.ok ? "#34D399" : "#F87171", textAlign: "center" }
                  ]}>
                    {sqSettleResult.message}
                    {sqSettleResult.refresh_required ? "\n(Refreshing queue…)" : ""}
                  </Text>
                )}

                {/* Action row */}
                <View style={styles.sqModalBtnRow}>
                  <Pressable
                    style={styles.sqModalCancelBtn}
                    onPress={() => { if (!sqSettleSubmitting) { setSqSettleTarget(null); setSqSettleAnswer(null); setSqSettleResult(null); } }}
                    disabled={sqSettleSubmitting}
                  >
                    <Text style={styles.sqModalCancelBtnText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.sqModalConfirmBtn, (!sqSettleAnswer || sqSettleSubmitting) && styles.sqModalConfirmBtnDisabled]}
                    onPress={handleSettleConfirm}
                    disabled={!sqSettleAnswer || sqSettleSubmitting}
                  >
                    {sqSettleSubmitting
                      ? <ActivityIndicator size="small" color="#000" />
                      : <Text style={styles.sqModalConfirmBtnText}>Confirm Settlement</Text>
                    }
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Impact Commercial Preview Modal ─────────────────────────────── */}
      <Modal
        visible={impactPreviewItem !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setImpactPreviewItem(null)}
      >
        <View style={styles.impactPreviewOverlay}>
          <View style={styles.impactPreviewSheet}>
            <View style={styles.impactPreviewHandle} />
            <View style={styles.impactPreviewHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.impactPreviewTitleText}>Commercial Preview</Text>
                <Text style={styles.impactPreviewSubtitle}>
                  Admin-only {commercialPreviewTarget ? `assignment preview · ${commercialPreviewTarget}` : "mockup · nothing is live or assigned"}
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Close commercial preview"
                onPress={() => setImpactPreviewItem(null)}
                style={styles.impactPreviewClose}
              >
                <Ionicons name="close" size={20} color={Colors.dark.textSecondary} />
              </Pressable>
            </View>

            {impactPreviewItem && (
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.impactPreviewContent}
              >
                <View style={styles.impactPreviewNotice}>
                  <Ionicons name="eye-outline" size={16} color="#FBBF24" />
                  <Text style={styles.impactPreviewNoticeText}>
                    {commercialPreviewTarget
                      ? `PREVIEW ONLY — exact participant-facing placement for ${commercialPreviewTarget}. Publishing remains a separate manual action.`
                      : "PREVIEW ONLY — this offer is not published or assigned to a participant-facing target."}
                  </Text>
                </View>

                <View style={styles.impactPreviewModeRow}>
                  {([
                    { value: "game_day" as const, label: "Game Day" },
                    { value: "fantasy_weekly" as const, label: "Fantasy Weekly" },
                  ]).map((option) => {
                    const selected = impactPreviewMode === option.value;
                    return (
                      <Pressable
                        key={option.value}
                        style={[
                          styles.impactPreviewModeBtn,
                          selected && styles.impactPreviewModeBtnSelected,
                        ]}
                        onPress={() => setImpactPreviewMode(option.value)}
                      >
                        <Text style={[
                          styles.impactPreviewModeText,
                          selected && styles.impactPreviewModeTextSelected,
                        ]}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <ImpactPreviewCard
                  item={impactPreviewItem}
                  mode={impactPreviewMode}
                  onOpenTracking={openImpactTrackingLink}
                />

                <Text style={styles.impactPreviewFooterNote}>
                  The CTA uses Impact’s returned tracking link. Opening it may count as an affiliate click,
                  but it does not publish or assign this offer.
                </Text>

                <Pressable
                  style={styles.impactPreviewDoneBtn}
                  onPress={() => setImpactPreviewItem(null)}
                >
                  <Text style={styles.impactPreviewDoneText}>Done</Text>
                </Pressable>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Legacy Global Settlement (hidden for rollback safety) ── */}
      {LEGACY_GS_ENABLED && (
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.sectionTitle}>Global Settlement (Legacy)</Text>
            <Text style={styles.sectionSub}>Settle one prop across all active rooms at once.</Text>
          </View>
          <Pressable onPress={() => savedToken && loadGsTemplProps(savedToken, gsSport)} style={styles.refreshBtn}>
            <Ionicons name="refresh" size={16} color={Colors.dark.tint} />
          </Pressable>
        </View>

        {/* Sport toggle */}
        <View style={styles.sportRow}>
          {(["nba", "soccer"] as const).map((s) => {
            const active = gsSport === s;
            return (
              <Pressable
                key={s}
                style={[styles.sportBtn, active && { borderColor: NBA_GOLD, backgroundColor: NBA_GOLD + "18" }]}
                onPress={() => {
                  setGsSport(s);
                  setGsSelectedProp(null);
                  setGsAnswer(null);
                  setGsPreview(null);
                  setGsMsg(null);
                  if (savedToken) loadGsTemplProps(savedToken, s);
                }}
              >
                <Text style={[styles.sportBtnText, active && { color: NBA_GOLD }]}>
                  {s === "nba" ? "🏀 NBA" : "⚽ Soccer"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Prop picker */}
        {gsTemplLoading ? (
          <ActivityIndicator color={NBA_GOLD} style={{ marginVertical: 8 }} />
        ) : gsTemplProps.length === 0 ? (
          <Text style={styles.emptyText}>No active props. Load the prop library first.</Text>
        ) : (
          <View style={{ gap: 6 }}>
            <Text style={styles.label}>Select a prop to settle</Text>
            {gsTemplProps.map((prop) => {
              const selected = gsSelectedProp?.id === prop.id;
              return (
                <Pressable
                  key={prop.id}
                  style={[
                    styles.nightCard,
                    selected && { borderColor: NBA_GOLD, backgroundColor: NBA_GOLD + "12" },
                  ]}
                  onPress={() => {
                    setGsSelectedProp(prop);
                    setGsAnswer(null);
                    setGsPreview(null);
                    setGsMsg(null);
                  }}
                >
                  <Text style={[styles.propQuestion, selected && { color: Colors.dark.text }]}>
                    {prop.question}
                  </Text>
                  <Text style={{ fontSize: 10, color: Colors.dark.tabIconDefault, marginTop: 2 }}>
                    {prop.phase.toUpperCase()} · {prop.settlement_window}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Answer picker */}
        {gsSelectedProp && (
          <View style={{ gap: 8, marginTop: 4 }}>
            <Text style={styles.label}>Winning answer</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {(gsSelectedProp.answer_options as string[]).map((opt) => {
                const chosen = gsAnswer === opt;
                return (
                  <Pressable
                    key={opt}
                    style={[
                      styles.resultBtn,
                      { paddingHorizontal: 14, paddingVertical: 10, flex: 0 },
                      chosen && styles.resultBtnYes,
                    ]}
                    onPress={() => {
                      setGsAnswer(opt);
                      setGsPreview(null);
                      setGsMsg(null);
                      loadGsPreview(gsSelectedProp.id, opt);
                    }}
                  >
                    <Text style={[styles.resultBtnText, chosen && styles.resultBtnTextActive]}>
                      {opt}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* Preview panel */}
        {gsPreviewLoading && <ActivityIndicator color={NBA_GOLD} style={{ marginTop: 8 }} />}
        {gsPreview && (
          <View style={{ backgroundColor: Colors.dark.background, borderRadius: 10, padding: 14, gap: 6, borderWidth: 1, borderColor: Colors.dark.border, marginTop: 4 }}>
            <Text style={{ fontSize: 13, color: Colors.dark.text, fontWeight: "700" }}>
              Settlement preview
            </Text>
            <Text style={{ fontSize: 13, color: Colors.dark.textSecondary }}>
              {gsPreview.props_count} prop{gsPreview.props_count !== 1 ? "s" : ""} · {gsPreview.rooms_count} room{gsPreview.rooms_count !== 1 ? "s" : ""} · {gsPreview.picks_count} pick{gsPreview.picks_count !== 1 ? "s" : ""} scored
            </Text>
            {gsPreview.rooms.length > 0 && (
              <View style={{ marginTop: 4, gap: 2 }}>
                {gsPreview.rooms.map((r) => (
                  <Text key={r.room_code} style={{ fontSize: 11, color: Colors.dark.tabIconDefault }}>
                    · {r.room_name} ({r.room_code})
                  </Text>
                ))}
              </View>
            )}
            {gsPreview.props_count === 0 && (
              <Text style={{ fontSize: 12, color: Colors.dark.tabIconDefault, fontStyle: "italic" }}>
                No unsettled props found in active rooms — nothing to do.
              </Text>
            )}
          </View>
        )}

        {/* Confirm button */}
        {gsPreview && gsPreview.props_count > 0 && (
          <Pressable
            style={({ pressed }) => [
              styles.resolveBtn,
              gsSettling && styles.resolveBtnDisabled,
              pressed && !gsSettling && { opacity: 0.85 },
            ]}
            onPress={handleGlobalSettle}
            disabled={gsSettling}
          >
            {gsSettling
              ? <ActivityIndicator color="#fff" size="small" />
              : (
                <>
                  <Ionicons name="flash" size={16} color="#fff" />
                  <Text style={styles.resolveBtnText}>
                    Settle {gsPreview.props_count} Prop{gsPreview.props_count !== 1 ? "s" : ""} in {gsPreview.rooms_count} Room{gsPreview.rooms_count !== 1 ? "s" : ""}
                  </Text>
                </>
              )}
          </Pressable>
        )}

        {gsMsg && <Text style={styles.createMsg}>{gsMsg}</Text>}
      </View>
      )}

      {/* ── Impact Commercial Review ───────────────────────────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>Commercial Review</Text>
            <Text style={styles.sectionSub}>
              Private Impact review · recent inventory only · no automatic publishing
            </Text>
          </View>
          <Pressable
            onPress={() => savedToken && loadImpactReview(savedToken)}
            style={styles.refreshBtn}
            disabled={impactReviewLoading}
          >
            <Ionicons name="refresh" size={16} color={Colors.dark.tint} />
          </Pressable>
        </View>

        <View style={styles.impactFilterGroup}>
          <Text style={styles.label}>Ad type</Text>
          <View style={styles.impactFilterRow}>
            {IMPACT_REVIEW_AD_TYPES.map((option) => {
              const selected = impactAdType === option.value;
              return (
                <Pressable
                  key={option.label}
                  style={[styles.impactFilterBtn, selected && styles.impactFilterBtnSelected]}
                  onPress={() => {
                    setImpactAdType(option.value);
                    if (savedToken) loadImpactReview(savedToken, option.value, impactKeyword);
                  }}
                  disabled={impactReviewLoading}
                >
                  <Text style={[styles.impactFilterText, selected && styles.impactFilterTextSelected]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.impactKeywordRow}>
          <TextInput
            style={[styles.input, styles.impactKeywordInput]}
            value={impactKeyword}
            onChangeText={(value) => setImpactKeyword(value.slice(0, IMPACT_REVIEW_KEYWORD_MAX_LENGTH))}
            placeholder="Filter name or deal text"
            placeholderTextColor={Colors.dark.tabIconDefault}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={IMPACT_REVIEW_KEYWORD_MAX_LENGTH}
            onSubmitEditing={() => savedToken && loadImpactReview(savedToken)}
          />
          <Pressable
            style={[styles.impactApplyBtn, impactReviewLoading && { opacity: 0.5 }]}
            onPress={() => savedToken && loadImpactReview(savedToken)}
            disabled={impactReviewLoading}
          >
            <Text style={styles.impactApplyText}>Apply</Text>
          </Pressable>
        </View>

        <Text style={styles.impactReviewNote}>
          Ads are limited to the last {impactReview?.updated_within_days ?? 30} days using Impact’s documented date filters.
          Ads are labeled “available to partner,” not approved.
        </Text>

        {impactReviewLoading && (
          <ActivityIndicator color={NBA_GOLD} style={{ marginVertical: 12 }} />
        )}

        {impactReviewError && (
          <Text style={[styles.createMsg, { color: "#F87171" }]}>⚠ {impactReviewError}</Text>
        )}

        {!impactReviewLoading && impactReview && (
          <>
            <View style={styles.impactSummaryBar}>
              <Text style={styles.impactSummaryText}>
                {impactReview.active_program_count} active program{impactReview.active_program_count === 1 ? "" : "s"}
              </Text>
              <Text style={styles.impactSummaryDot}>·</Text>
              <Text style={styles.impactSummaryText}>{impactReview.totals.deals} active deals</Text>
              <Text style={styles.impactSummaryDot}>·</Text>
              <Text style={styles.impactSummaryText}>
                {impactReview.totals.ads} recent ads
              </Text>
              <Text style={styles.impactSummaryDot}>·</Text>
              <Text style={styles.impactSummaryText}>
                {impactReview.totals.creatives} creatives
              </Text>
            </View>

            {impactReview.programs.map((program) => (
              <View key={program.program.program_id ?? program.program.program_name} style={styles.impactProgramCard}>
                <View style={styles.impactProgramHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.impactBrandName}>
                      {program.program.brand_name ?? "Unknown brand"}
                    </Text>
                    <Text style={styles.impactProgramName}>
                      {program.program.program_name ?? "Unnamed program"}
                    </Text>
                  </View>
                  <View style={styles.impactProgramCounts}>
                    <Text style={styles.impactCountText}>{program.counts.deals} deals</Text>
                    <Text style={styles.impactCountText}>{program.counts.ads} ads</Text>
                  </View>
                </View>

                <Text style={styles.impactGroupLabel}>Active deals</Text>
                {program.deals.length === 0 ? (
                  <Text style={styles.impactEmptyText}>No active deals returned.</Text>
                ) : (
                  program.deals.map((deal) => (
                    <View key={`deal:${deal.external_id}`} style={styles.impactOfferCard}>
                      <View style={styles.impactOfferHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.impactOfferTitle}>{deal.title ?? "Untitled deal"}</Text>
                          <Text style={styles.impactStatusText}>
                            {(deal.status ?? "active").toUpperCase()} · Impact deal
                          </Text>
                        </View>
                        <View style={styles.impactOfferActions}>
                          <Pressable
                            style={[
                              styles.impactShortlistBtn,
                              isImpactShortlisted(deal) && styles.impactShortlistBtnSelected,
                            ]}
                            onPress={() => toggleImpactShortlist(deal)}
                          >
                            <Ionicons
                              name={isImpactShortlisted(deal) ? "checkmark" : "bookmark-outline"}
                              size={14}
                              color={isImpactShortlisted(deal) ? "#000" : Colors.dark.tint}
                            />
                            <Text style={[
                              styles.impactShortlistText,
                              isImpactShortlisted(deal) && styles.impactShortlistTextSelected,
                            ]}>
                              {isImpactShortlisted(deal) ? "Shortlisted" : "Select for Swayger"}
                            </Text>
                          </Pressable>
                          {isImpactShortlisted(deal) && (
                            <Pressable
                              style={styles.impactPreviewBtn}
                              onPress={() => openImpactPreview(deal)}
                            >
                              <Ionicons name="eye-outline" size={14} color={Colors.dark.text} />
                              <Text style={styles.impactPreviewBtnText}>Preview</Text>
                            </Pressable>
                          )}
                            {isImpactShortlisted(deal) && (
                              savedCommercialOffer(deal) ? (
                                <Text style={styles.commercialSavedText}>Saved</Text>
                              ) : (
                                <Pressable
                                  style={styles.impactSaveBtn}
                                  onPress={() => saveImpactOffer(deal)}
                                >
                                  <Ionicons name="cloud-upload-outline" size={14} color={Colors.dark.text} />
                                  <Text style={styles.impactPreviewBtnText}>Save as Swayger Offer</Text>
                                </Pressable>
                              )
                            )}
                        </View>
                      </View>
                      {deal.description && <Text style={styles.impactOfferDescription}>{deal.description}</Text>}
                      <View style={styles.impactDetailRow}>
                        {deal.discount_amount != null && (
                          <Text style={styles.impactDetailText}>
                            {deal.discount_currency ?? ""}{deal.discount_amount} {deal.discount_type?.toLowerCase() ?? "discount"}
                          </Text>
                        )}
                        {deal.discount_percent != null && (
                          <Text style={styles.impactDetailText}>{deal.discount_percent}% off</Text>
                        )}
                        {deal.minimum_purchase_amount != null && (
                          <Text style={styles.impactDetailText}>
                            Min {deal.discount_currency ?? "$"}{deal.minimum_purchase_amount}
                          </Text>
                        )}
                      </View>
                      {deal.promo_code && (
                        <Text style={styles.impactCodeText}>Promo code: {deal.promo_code}</Text>
                      )}
                      {(deal.start_at || deal.end_at) && (
                        <Text style={styles.impactMetaText}>
                          {formatImpactDate(deal.start_at) ?? "Now"} – {formatImpactDate(deal.end_at) ?? "No end date"}
                        </Text>
                      )}
                    </View>
                  ))
                )}

                <Text style={styles.impactGroupLabel}>Recent ads and creatives</Text>
                {program.ads.length === 0 ? (
                  <Text style={styles.impactEmptyText}>No recent ads match the current filters.</Text>
                ) : (
                  program.ads.map((ad) => (
                    <View key={`ad:${ad.external_id}`} style={styles.impactAdCard}>
                      {ad.creative_url && (
                        <Image
                          source={{ uri: impactCreativeSource(ad.creative_url) }}
                          style={styles.impactCreativePreview}
                          resizeMode="contain"
                        />
                      )}
                      <View style={{ flex: 1, gap: 5 }}>
                        <View style={styles.impactOfferHeader}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.impactOfferTitle}>{ad.title ?? "Untitled ad"}</Text>
                            <Text style={styles.impactStatusText}>
                              {ad.creative_type ?? "AD"} · Available to partner
                            </Text>
                          </View>
                          <View style={styles.impactOfferActions}>
                            <Pressable
                              style={[
                                styles.impactShortlistBtn,
                                isImpactShortlisted(ad) && styles.impactShortlistBtnSelected,
                              ]}
                              onPress={() => toggleImpactShortlist(ad)}
                            >
                              <Ionicons
                                name={isImpactShortlisted(ad) ? "checkmark" : "bookmark-outline"}
                                size={14}
                                color={isImpactShortlisted(ad) ? "#000" : Colors.dark.tint}
                              />
                              <Text style={[
                                styles.impactShortlistText,
                                isImpactShortlisted(ad) && styles.impactShortlistTextSelected,
                              ]}>
                                {isImpactShortlisted(ad) ? "Shortlisted" : "Select for Swayger"}
                              </Text>
                            </Pressable>
                            {isImpactShortlisted(ad) && (
                              <Pressable
                                style={styles.impactPreviewBtn}
                                onPress={() => openImpactPreview(ad)}
                              >
                                <Ionicons name="eye-outline" size={14} color={Colors.dark.text} />
                                <Text style={styles.impactPreviewBtnText}>Preview</Text>
                              </Pressable>
                            )}
                            {isImpactShortlisted(ad) && (
                              savedCommercialOffer(ad) ? (
                                <Text style={styles.commercialSavedText}>Saved</Text>
                              ) : (
                                <Pressable
                                  style={styles.impactSaveBtn}
                                  onPress={() => saveImpactOffer(ad)}
                                >
                                  <Ionicons name="cloud-upload-outline" size={14} color={Colors.dark.text} />
                                  <Text style={styles.impactPreviewBtnText}>Save as Swayger Offer</Text>
                                </Pressable>
                              )
                            )}
                          </View>
                        </View>
                        {ad.description && <Text style={styles.impactOfferDescription}>{ad.description}</Text>}
                        <View style={styles.impactDetailRow}>
                          {ad.creative_width && ad.creative_height && (
                            <Text style={styles.impactDetailText}>
                              {ad.creative_width}×{ad.creative_height}
                            </Text>
                          )}
                          {ad.promo_code && (
                            <Text style={styles.impactCodeText}>Code: {ad.promo_code}</Text>
                          )}
                          <Text style={styles.impactDetailText}>
                            {ad.tracking_url ? "Tracking link ready" : "No tracking link"}
                          </Text>
                        </View>
                        {ad.landing_page_url && (
                          <Text style={styles.impactUrlText} numberOfLines={1}>
                            Landing page: {ad.landing_page_url}
                          </Text>
                        )}
                      </View>
                    </View>
                  ))
                )}
              </View>
            ))}
          </>
        )}

        <View style={styles.impactFullInventoryBox}>
          <View style={{ flex: 1 }}>
            <Text style={styles.impactFullTitle}>Full inventory</Text>
            <Text style={styles.impactFullSub}>
              Separate, on-demand load of the complete Impact inventory. This can take up to a minute.
            </Text>
          </View>
          <Pressable
            style={[styles.impactFullBtn, impactFullLoading && { opacity: 0.5 }]}
            onPress={loadFullImpactInventory}
            disabled={impactFullLoading}
          >
            {impactFullLoading
              ? <ActivityIndicator size="small" color="#000" />
              : <Text style={styles.impactFullBtnText}>Load full</Text>}
          </Pressable>
        </View>
        {impactFullError && <Text style={[styles.createMsg, { color: "#F87171" }]}>⚠ {impactFullError}</Text>}
        {impactFullSummary && (
          <Text style={styles.impactFullResult}>
            Full inventory loaded: {impactFullSummary.deals} deals · {impactFullSummary.ads} ads
            {" · "}{formatImpactDate(impactFullSummary.fetched_at) ?? "just now"}
          </Text>
        )}
        <Text style={styles.impactInternalNote}>
          Shortlists are review state. Saved Offers remain drafts until an admin assigns and manually publishes them.
        </Text>

        <View style={styles.commercialWorkflowBox}>
          <View style={styles.impactProgramHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.impactGroupLabel}>Swayger Offers</Text>
              <Text style={styles.impactFullSub}>
                Persist reviewed offers, assign them to an existing target, preview the exact placement, then publish manually.
              </Text>
            </View>
            <Pressable
              style={styles.refreshBtn}
              onPress={() => savedToken && loadCommercialWorkflow(savedToken)}
              disabled={commercialLoading}
            >
              <Ionicons name="refresh" size={16} color={Colors.dark.tint} />
            </Pressable>
          </View>

          {commercialError && <Text style={[styles.createMsg, { color: "#F87171" }]}>⚠ {commercialError}</Text>}
          {commercialLoading ? (
            <ActivityIndicator color={NBA_GOLD} style={{ marginVertical: 16 }} />
          ) : commercialOffers.length === 0 ? (
            <Text style={styles.impactEmptyText}>Select an Impact item and save it as a Swayger Offer.</Text>
          ) : (
            commercialOffers.map((offer) => {
              const assignments = commercialAssignments.filter((item) => item.offer_id === offer.id);
              const pickerOpen = commercialTargetPickerOfferId === offer.id;
              return (
                <View key={offer.id} style={styles.commercialOfferRow}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.impactOfferTitle}>{offer.title}</Text>
                    <Text style={styles.impactStatusText}>
                      {offer.brand_name ?? offer.program_name ?? "Featured Offer"} · {offer.provider.toUpperCase()} · Saved draft
                    </Text>
                    {offer.promo_code && <Text style={styles.impactCodeText}>Code: {offer.promo_code}</Text>}
                  </View>
                  <View style={styles.impactOfferActions}>
                    <Pressable
                      style={styles.impactPreviewBtn}
                      onPress={() => {
                        setImpactPreviewMode("game_day");
                        setCommercialPreviewTarget("Unassigned placement");
                        setImpactPreviewItem(offerAsImpactItem(offer));
                      }}
                    >
                      <Ionicons name="eye-outline" size={14} color={Colors.dark.text} />
                      <Text style={styles.impactPreviewBtnText}>Preview</Text>
                    </Pressable>
                    <Pressable
                      style={styles.impactSaveBtn}
                      onPress={() => {
                        setCommercialTargetPickerOfferId(pickerOpen ? null : offer.id);
                        if (!pickerOpen) loadCommercialTargets(commercialTargetType);
                      }}
                    >
                      <Ionicons name="link-outline" size={14} color={Colors.dark.text} />
                      <Text style={styles.impactPreviewBtnText}>Assign</Text>
                    </Pressable>
                  </View>

                  {pickerOpen && (
                    <View style={styles.commercialTargetPicker}>
                      <View style={styles.impactFilterRow}>
                        {([
                          ["game_day", "Game Day targets"],
                          ["fantasy_weekly", "Fantasy Weekly targets"],
                        ] as const).map(([type, label]) => (
                          <Pressable
                            key={type}
                            style={[
                              styles.impactFilterBtn,
                              commercialTargetType === type && styles.impactFilterBtnSelected,
                            ]}
                            onPress={() => loadCommercialTargets(type)}
                          >
                            <Text style={[
                              styles.impactFilterText,
                              commercialTargetType === type && styles.impactFilterTextSelected,
                            ]}>
                              {label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                      {commercialTargets.length === 0 ? (
                        <Text style={styles.impactEmptyText}>No eligible existing targets found.</Text>
                      ) : commercialTargets.map((target) => {
                        const hasActiveAssignment = Boolean(target.published_assignment);
                        return (
                          <View key={target.target_id} style={styles.commercialTargetRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.impactOfferTitle}>{target.label}</Text>
                              <Text style={styles.impactStatusText}>
                                {target.target_type === "fantasy_weekly" ? `Week ${target.week_number ?? "?"}` : target.matchup ?? "Game Day"}
                                {" · "}{target.participant_count} participant{target.participant_count === 1 ? "" : "s"}
                                {hasActiveAssignment ? " · Published offer already assigned" : ""}
                              </Text>
                            </View>
                            <Pressable
                              style={[styles.impactSaveBtn, hasActiveAssignment && { opacity: 0.45 }]}
                              disabled={hasActiveAssignment}
                              onPress={() => assignOfferToTarget(offer.id, target)}
                            >
                              <Text style={styles.impactPreviewBtnText}>{hasActiveAssignment ? "In use" : "Choose"}</Text>
                            </Pressable>
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {assignments.map((assignment) => (
                    <View key={assignment.id} style={styles.commercialAssignmentRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.impactStatusText}>
                          {assignment.target_type === "fantasy_weekly" ? "Fantasy Weekly" : "Game Day"} · {assignment.target?.room_name ?? assignment.target_id}
                        </Text>
                        <Text style={[
                          styles.commercialAssignmentStatus,
                          assignment.status === "published" && styles.commercialAssignmentPublished,
                        ]}>
                          {assignment.status === "published" ? "PUBLISHED" : assignment.status.toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.impactOfferActions}>
                        <Pressable
                          style={styles.impactPreviewBtn}
                          onPress={() => openCommercialAssignmentPreview(assignment)}
                        >
                          <Text style={styles.impactPreviewBtnText}>Preview assignment</Text>
                        </Pressable>
                        <Pressable
                          style={[
                            styles.impactSaveBtn,
                            assignment.status === "published" && styles.impactUnpublishBtn,
                          ]}
                          onPress={() => setAssignmentPublished(assignment, assignment.status !== "published")}
                        >
                          <Text style={styles.impactPreviewBtnText}>
                            {assignment.status === "published" ? "Unpublish" : "Publish"}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              );
            })
          )}
        </View>
      </View>

      {/* ── Prop Library ── */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.sectionTitle}>Prop Library</Text>
            <Text style={styles.sectionSub}>Enable/disable props available to hosts.</Text>
          </View>
          <Pressable onPress={() => savedToken && loadPropLibrary(savedToken, libSport)} style={styles.refreshBtn}>
            <Ionicons name="refresh" size={16} color={Colors.dark.tint} />
          </Pressable>
        </View>

        {/* Sport filter */}
        <View style={[styles.sportRow, { marginBottom: 16 }]}>
          {(["nba", "soccer"] as const).map((s) => {
            const active = libSport === s;
            return (
              <Pressable
                key={s}
                style={[styles.sportBtn, active && { borderColor: NBA_GOLD, backgroundColor: NBA_GOLD + "18" }]}
                onPress={() => {
                  setLibSport(s);
                  if (savedToken) loadPropLibrary(savedToken, s);
                }}
              >
                <Text style={[styles.sportBtnText, active && { color: NBA_GOLD }]}>
                  {s === "nba" ? "🏀 NBA" : "⚽ Soccer"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {libLoading ? (
          <ActivityIndicator color={NBA_GOLD} style={{ marginVertical: 16 }} />
        ) : libProps.length === 0 ? (
          <Text style={styles.emptyText}>No props found. Run the phase 2 migration first.</Text>
        ) : (
          libProps.map((prop) => (
            <View key={prop.id} style={[styles.propRow, { flexDirection: "row", alignItems: "flex-start", gap: 10 }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.propQuestion, !prop.is_active && { color: Colors.dark.tabIconDefault, textDecorationLine: "line-through" }]}>
                  {prop.question}
                </Text>
                <Text style={{ fontSize: 10, color: Colors.dark.tabIconDefault, marginTop: 2 }}>
                  {prop.phase.toUpperCase()} · {prop.settlement_window}
                </Text>
              </View>
              <Pressable
                onPress={() => handleTogglePropActive(prop.id, prop.is_active)}
                disabled={libTogglingId === prop.id}
                style={[
                  styles.resultBtn,
                  { paddingHorizontal: 10, paddingVertical: 6 },
                  prop.is_active ? styles.resultBtnYes : {},
                ]}
              >
                {libTogglingId === prop.id
                  ? <ActivityIndicator size="small" color={Colors.dark.text} />
                  : <Text style={[styles.resultBtnText, styles.resultBtnTextActive]}>
                      {prop.is_active ? "ON" : "OFF"}
                    </Text>
                }
              </Pressable>
            </View>
          ))
        )}

        {/* Add prop */}
        <Pressable
          style={[styles.addQuestionBtn, { marginTop: 12 }]}
          onPress={() => setShowAddProp((v) => !v)}
        >
          <Ionicons name={showAddProp ? "chevron-up" : "add-circle-outline"} size={16} color={Colors.dark.tint} />
          <Text style={styles.addQuestionText}>{showAddProp ? "Cancel" : "Add a prop"}</Text>
        </Pressable>

        {showAddProp && (
          <View style={{ gap: 8, marginTop: 12 }}>
            <TextInput style={styles.input} placeholder="ID (e.g. pg_new_prop)" placeholderTextColor={Colors.dark.tabIconDefault}
              value={newPropId} onChangeText={setNewPropId} autoCapitalize="none" />
            <TextInput style={styles.input} placeholder="Phase (pregame / halftime / fourth / final_push / penalties)"
              placeholderTextColor={Colors.dark.tabIconDefault} value={newPropPhase} onChangeText={setNewPropPhase} autoCapitalize="none" />
            <TextInput style={styles.input} placeholder="Question text" placeholderTextColor={Colors.dark.tabIconDefault}
              value={newPropQuestion} onChangeText={setNewPropQuestion} />
            <TextInput style={styles.input} placeholder="Answers separated by | (e.g. Yes | No)" placeholderTextColor={Colors.dark.tabIconDefault}
              value={newPropAnswers} onChangeText={setNewPropAnswers} />
            <TextInput style={styles.input} placeholder="Settlement window (e.g. End Game)" placeholderTextColor={Colors.dark.tabIconDefault}
              value={newPropWindow} onChangeText={setNewPropWindow} />
            <Pressable
              style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.8 }, addingProp && { opacity: 0.5 }]}
              onPress={handleAddProp} disabled={addingProp}
            >
              {addingProp
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.primaryBtnText}>Add Prop →</Text>}
            </Pressable>
            {addPropMsg && <Text style={styles.createMsg}>{addPropMsg}</Text>}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  centered: { justifyContent: "center", alignItems: "center" },
  scrollContent: { paddingBottom: 100 },

  // Token screen
  tokenScreen: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingHorizontal: 32, gap: 16, marginTop: 60,
  },
  tokenTitle: {
    fontFamily: "BarlowCondensed_800ExtraBold",
    fontSize: 28, color: Colors.dark.text, textTransform: "uppercase",
  },
  tokenSub: { fontSize: 14, color: Colors.dark.textSecondary, textAlign: "center" },
  tokenInput: {
    width: "100%", backgroundColor: Colors.dark.surface,
    borderWidth: 1, borderColor: Colors.dark.border, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 15,
    color: Colors.dark.text,
  },
  tokenInputRow: {
    width: "100%", flexDirection: "row", alignItems: "center",
    backgroundColor: Colors.dark.surface,
    borderWidth: 1, borderColor: Colors.dark.border, borderRadius: 12,
  },
  tokenInputInner: {
    flex: 1, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 15, color: Colors.dark.text,
  },
  tokenEyeBtn: { paddingHorizontal: 14, paddingVertical: 14 },
  tokenErrorText: {
    width: "100%", fontSize: 13, color: "#F87171",
    textAlign: "center", marginTop: -4,
  },
  backLink: { marginTop: 8 },
  backLinkText: { fontSize: 14, color: Colors.dark.tabIconDefault },

  // Header
  headerRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 16,
  },
  backBtn: { padding: 4 },
  pageTitle: {
    fontFamily: "BarlowCondensed_800ExtraBold",
    fontSize: 22, color: Colors.dark.text, textTransform: "uppercase", letterSpacing: 1,
  },
  lockBtn: { padding: 4 },

  // Sections
  section: {
    marginHorizontal: 20, marginBottom: 28,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1, borderColor: Colors.dark.border,
    borderRadius: 16, padding: 16, gap: 16,
  },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: {
    fontFamily: "BarlowCondensed_800ExtraBold",
    fontSize: 18, color: Colors.dark.text, textTransform: "uppercase", letterSpacing: 0.5,
  },
  sectionSub: { fontSize: 13, color: Colors.dark.textSecondary, marginTop: -8 },
  refreshBtn: { padding: 4 },

  // Form
  fieldGroup: { gap: 6 },
  label: {
    fontSize: 11, color: Colors.dark.textSecondary,
    textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "600",
  },
  input: {
    backgroundColor: Colors.dark.background,
    borderWidth: 1, borderColor: Colors.dark.border, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 11, fontSize: 14,
    color: Colors.dark.text,
  },
  hint: { fontSize: 11, color: Colors.dark.tabIconDefault },
  questionRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  questionInput: { flex: 1, marginBottom: 0 },
  removeBtn: { padding: 2 },
  addQuestionBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginTop: 4, alignSelf: "flex-start",
  },
  addQuestionText: { fontSize: 13, color: Colors.dark.tint },

  primaryBtn: {
    backgroundColor: Colors.dark.tint, borderRadius: 12,
    paddingVertical: 14, alignItems: "center",
  },
  primaryBtnText: {
    color: "#fff", fontSize: 16, fontWeight: "700",
  },
  createMsg: { fontSize: 13, color: Colors.dark.textSecondary, textAlign: "center" },

  // Night cards
  nightCard: {
    backgroundColor: Colors.dark.background,
    borderWidth: 1, borderColor: Colors.dark.border, borderRadius: 12, padding: 14, gap: 12,
  },
  nightCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  nightDate: { fontWeight: "700", fontSize: 15, color: Colors.dark.text },
  statusPill: {
    backgroundColor: `${Colors.dark.tint}20`,
    borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2,
  },
  statusPillLocked: { backgroundColor: `${Colors.dark.accentGold}20` },
  statusPillText: { fontSize: 10, color: Colors.dark.tint, fontWeight: "700" },
  nightLock: { fontSize: 12, color: Colors.dark.textSecondary, marginTop: -8 },
  sportBadge: {
    borderRadius: 6, borderWidth: 1,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  sportBadgeText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  sportRow: { flexDirection: "row", gap: 8, marginTop: 6 },
  sportBtn: {
    paddingHorizontal: 18, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1.5, borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.surface,
  },
  sportBtnText: { fontSize: 13, fontWeight: "600", color: Colors.dark.textSecondary },

  // Prop rows
  propRow: { gap: 6 },
  propQuestion: { fontSize: 13, color: Colors.dark.text, fontWeight: "500", lineHeight: 18 },
  resultBtns: { flexDirection: "row", gap: 8 },
  resultBtn: {
    flex: 1, paddingVertical: 9, borderRadius: 8,
    borderWidth: 1.5, borderColor: Colors.dark.border,
    alignItems: "center",
  },
  resultBtnYes: { borderColor: Colors.dark.success, backgroundColor: `${Colors.dark.success}15` },
  resultBtnNo: { borderColor: Colors.dark.danger, backgroundColor: `${Colors.dark.danger}15` },
  resultBtnVoid: { borderColor: Colors.dark.textSecondary, backgroundColor: `${Colors.dark.textSecondary}15` },
  resultBtnText: { fontSize: 11, fontWeight: "700", color: Colors.dark.textSecondary },
  resultBtnTextActive: { color: Colors.dark.text },

  resolveBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, backgroundColor: Colors.dark.success,
    borderRadius: 10, paddingVertical: 13,
  },
  resolveBtnDisabled: { opacity: 0.35 },
  resolveBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  emptyText: { fontSize: 13, color: Colors.dark.tabIconDefault, textAlign: "center", paddingVertical: 12 },

  // ── Settlement Queue styles ───────────────────────────────────────────────
  sqSummaryBar: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: Colors.dark.background,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  sqSummaryText: { fontSize: 12, color: Colors.dark.textSecondary, fontWeight: "600" },
  sqSummaryDot: { fontSize: 12, color: Colors.dark.tabIconDefault },

  sqEventCard: {
    backgroundColor: Colors.dark.background,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.dark.border,
    overflow: "hidden",
  },
  sqEventHeader: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  sqEventLabel: {
    fontSize: 14, fontWeight: "700", color: Colors.dark.text, flex: 1,
  },
  sqEventMeta: {
    fontSize: 11, color: Colors.dark.tabIconDefault,
  },

  sqLegacyBadge: {
    backgroundColor: "#FBBF2420", borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 1,
    borderWidth: 1, borderColor: "#FBBF2440",
  },
  sqLegacyBadgeText: {
    fontSize: 9, fontWeight: "700", color: "#FBBF24", letterSpacing: 0.5,
  },
  sqLegacyNotice: {
    flexDirection: "row", alignItems: "flex-start", gap: 6,
    backgroundColor: "#FBBF2410", borderRadius: 8,
    padding: 10, borderWidth: 1, borderColor: "#FBBF2430",
    marginHorizontal: 14,
  },
  sqLegacyNoticeText: {
    flex: 1, fontSize: 12, color: "#FBBF24", lineHeight: 17,
  },

  sqGroupCard: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 10, borderWidth: 1, borderColor: Colors.dark.border,
    marginHorizontal: 8, overflow: "hidden",
  },
  sqGroupHeader: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  sqGroupQuestion: {
    fontSize: 13, color: Colors.dark.text, fontWeight: "500", lineHeight: 18,
  },
  sqGroupMeta: {
    fontSize: 11, color: Colors.dark.tabIconDefault,
  },

  sqPhasePill: {
    backgroundColor: `${Colors.dark.tint}20`,
    borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
  },
  sqPhasePillText: {
    fontSize: 9, fontWeight: "700", color: Colors.dark.tint, letterSpacing: 0.5,
  },

  sqConflictRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 6,
    backgroundColor: "#FBBF2410", borderRadius: 8,
    padding: 8, borderWidth: 1, borderColor: "#FBBF2430",
    marginHorizontal: 12,
  },
  sqConflictText: {
    flex: 1, fontSize: 12, color: "#FBBF24", lineHeight: 17,
  },

  sqOptionPill: {
    backgroundColor: Colors.dark.background,
    borderRadius: 8, borderWidth: 1, borderColor: Colors.dark.border,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  sqOptionPillText: {
    fontSize: 12, color: Colors.dark.text,
  },
  sqNormText: {
    fontSize: 11, color: Colors.dark.tabIconDefault, fontFamily: "monospace" as any,
  },

  // Status chips in summary bar
  sqStatusChip: { flexDirection: "row", alignItems: "center", gap: 4 },
  sqStatusDot: { width: 6, height: 6, borderRadius: 3 },

  // Status badge on each group card (collapsed view)
  sqStatusBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    borderRadius: 4, borderWidth: 1,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  sqStatusBadgeText: {
    fontSize: 9, fontWeight: "700", letterSpacing: 0.4,
  },

  // Answer map rows (expanded view)
  sqAnswerMapRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.dark.background,
    borderRadius: 8, padding: 8,
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  sqAnswerMapStored: {
    fontSize: 12, color: Colors.dark.text, fontWeight: "500",
  },

  // ── Settle Group button (flag-gated, safe groups only) ────────────────────
  sqSettleBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: "#34D399",
    borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14,
    marginHorizontal: 12, marginBottom: 10, marginTop: 6,
  },
  sqSettleBtnText: {
    fontSize: 13, fontWeight: "700", color: "#000",
  },

  // ── Confirmation modal (bottom sheet) ────────────────────────────────────
  sqModalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end",
  },
  sqModalSheet: {
    backgroundColor: Colors.dark.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 16, paddingHorizontal: 20, paddingBottom: 40,
    gap: 12,
  },
  sqModalHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.dark.border, alignSelf: "center", marginBottom: 4,
  },
  sqModalTitle: {
    fontSize: 18, fontWeight: "700", color: Colors.dark.text,
  },
  sqModalGameLabel: {
    fontSize: 12, color: Colors.dark.tabIconDefault,
  },
  sqModalQuestion: {
    fontSize: 15, color: Colors.dark.text, lineHeight: 22,
  },
  sqModalMeta: {
    fontSize: 12, color: Colors.dark.tabIconDefault,
  },
  sqModalOptionRow: {
    flexDirection: "row", flexWrap: "wrap", gap: 8,
  },
  sqModalOption: {
    flex: 1, minWidth: 110,
    alignItems: "center", paddingVertical: 13,
    borderRadius: 10, borderWidth: 2, borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.background,
  },
  sqModalOptionSelected: {
    borderColor: "#34D399", backgroundColor: "rgba(52,211,153,0.12)",
  },
  sqModalOptionText: {
    fontSize: 14, fontWeight: "600", color: Colors.dark.text, textAlign: "center",
  },
  sqModalOptionTextSelected: {
    color: "#34D399",
  },
  sqModalBtnRow: {
    flexDirection: "row", gap: 10, marginTop: 4,
  },
  sqModalCancelBtn: {
    flex: 1, alignItems: "center", paddingVertical: 13,
    borderRadius: 10, borderWidth: 1, borderColor: Colors.dark.border,
  },
  sqModalCancelBtnText: {
    fontSize: 15, fontWeight: "600", color: Colors.dark.tabIconDefault,
  },
  sqModalConfirmBtn: {
    flex: 2, alignItems: "center", justifyContent: "center",
    paddingVertical: 13, borderRadius: 10, backgroundColor: "#34D399",
  },
  sqModalConfirmBtnDisabled: {
    backgroundColor: Colors.dark.border,
  },
  sqModalConfirmBtnText: {
    fontSize: 15, fontWeight: "700", color: "#000",
  },

  // ── Impact Commercial Preview ───────────────────────────────────────────
  impactPreviewOverlay: {
    flex: 1, alignItems: "center", justifyContent: "center",
    padding: 16, backgroundColor: "rgba(0,0,0,0.72)",
  },
  impactPreviewSheet: {
    width: "100%", maxWidth: 620, maxHeight: "92%",
    backgroundColor: Colors.dark.surface, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.dark.borderStrong,
    overflow: "hidden",
  },
  impactPreviewHandle: {
    width: 42, height: 4, borderRadius: 4,
    alignSelf: "center", marginTop: 10,
    backgroundColor: Colors.dark.borderStrong,
  },
  impactPreviewHeader: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    paddingHorizontal: 18, paddingTop: 14, paddingBottom: 10,
  },
  impactPreviewTitleText: {
    color: Colors.dark.text, fontSize: 20, fontWeight: "800",
  },
  impactPreviewSubtitle: {
    color: Colors.dark.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 3,
  },
  impactPreviewClose: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: "center", justifyContent: "center",
    backgroundColor: Colors.dark.background,
  },
  impactPreviewContent: {
    paddingHorizontal: 18, paddingBottom: 22, gap: 14,
  },
  impactPreviewNotice: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    padding: 11, borderRadius: 10,
    backgroundColor: "#FBBF2412", borderWidth: 1, borderColor: "#FBBF2450",
  },
  impactPreviewNoticeText: {
    flex: 1, color: "#FBBF24", fontSize: 11, lineHeight: 16, fontWeight: "700",
  },
  impactPreviewModeRow: {
    flexDirection: "row", gap: 8,
  },
  impactPreviewModeBtn: {
    flex: 1, alignItems: "center", paddingVertical: 10,
    borderRadius: 9, borderWidth: 1, borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.background,
  },
  impactPreviewModeBtnSelected: {
    borderColor: Colors.dark.tint, backgroundColor: `${Colors.dark.tint}20`,
  },
  impactPreviewModeText: {
    color: Colors.dark.textSecondary, fontSize: 12, fontWeight: "700",
  },
  impactPreviewModeTextSelected: {
    color: Colors.dark.tint,
  },
  impactPreviewMock: {
    overflow: "hidden", borderRadius: 16, borderWidth: 1,
  },
  impactPreviewMockGameDay: {
    borderColor: "#FBBF2460", backgroundColor: "#11100B",
  },
  impactPreviewMockFantasy: {
    borderColor: `${Colors.dark.tint}80`, backgroundColor: "#0D1020",
  },
  impactPreviewMockTopline: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 15, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: Colors.dark.border,
  },
  impactPreviewMockEyebrow: {
    color: Colors.dark.textSecondary, fontSize: 10, fontWeight: "800",
    letterSpacing: 1.2,
  },
  impactPreviewMockPreviewLabel: {
    color: "#FBBF24", fontSize: 9, fontWeight: "900", letterSpacing: 1,
  },
  impactPreviewCreative: {
    width: "100%", height: 118, backgroundColor: Colors.dark.background,
  },
  impactPreviewMockBody: {
    padding: 16, gap: 9,
  },
  impactPreviewBrand: {
    color: Colors.dark.tint, fontSize: 11, fontWeight: "800",
    textTransform: "uppercase", letterSpacing: 0.8,
  },
  impactPreviewTitle: {
    color: Colors.dark.text, fontSize: 22, lineHeight: 27, fontWeight: "800",
  },
  impactPreviewDescription: {
    color: Colors.dark.textSecondary, fontSize: 13, lineHeight: 19,
  },
  impactPreviewMetaRow: {
    flexDirection: "row", flexWrap: "wrap", gap: 7, alignItems: "center",
  },
  impactPreviewMeta: {
    color: Colors.dark.text, fontSize: 12, fontWeight: "800",
    backgroundColor: `${Colors.dark.tint}25`, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 5,
  },
  impactPreviewCode: {
    color: "#FBBF24", fontSize: 12, fontWeight: "800",
    backgroundColor: "#FBBF2418", borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 5,
  },
  impactPreviewCta: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7,
    minHeight: 44, borderRadius: 10, backgroundColor: NBA_GOLD,
    paddingHorizontal: 15, paddingVertical: 11,
  },
  impactPreviewCtaDisabled: {
    backgroundColor: Colors.dark.border,
  },
  impactPreviewCtaText: {
    color: "#000", fontSize: 13, fontWeight: "900",
  },
  impactPreviewDisclosure: {
    color: Colors.dark.textSecondary, fontSize: 10, lineHeight: 15,
  },
  impactPreviewFooterNote: {
    color: Colors.dark.tabIconDefault, fontSize: 10, lineHeight: 15,
  },
  impactPreviewDoneBtn: {
    alignItems: "center", paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  impactPreviewDoneText: {
    color: Colors.dark.textSecondary, fontSize: 13, fontWeight: "700",
  },

  // ── Impact Commercial Review ─────────────────────────────────────────────
  impactFilterGroup: { gap: 6 },
  impactFilterRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  impactFilterBtn: {
    borderWidth: 1, borderColor: Colors.dark.border, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 7,
    backgroundColor: Colors.dark.background,
  },
  impactFilterBtnSelected: {
    borderColor: Colors.dark.tint, backgroundColor: `${Colors.dark.tint}20`,
  },
  impactFilterText: { fontSize: 11, color: Colors.dark.textSecondary, fontWeight: "600" },
  impactFilterTextSelected: { color: Colors.dark.tint },
  impactKeywordRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  impactKeywordInput: { flex: 1 },
  impactApplyBtn: {
    backgroundColor: Colors.dark.tint, borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  impactApplyText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  impactReviewNote: {
    fontSize: 11, color: Colors.dark.tabIconDefault, lineHeight: 16,
  },
  impactSummaryBar: {
    flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6,
    backgroundColor: Colors.dark.background, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.dark.border,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  impactSummaryText: { fontSize: 11, color: Colors.dark.textSecondary, fontWeight: "700" },
  impactSummaryDot: { fontSize: 11, color: Colors.dark.tabIconDefault },
  impactProgramCard: {
    backgroundColor: Colors.dark.background, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.dark.border, padding: 12, gap: 10,
  },
  impactProgramHeader: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: Colors.dark.border,
  },
  impactBrandName: { fontSize: 15, color: Colors.dark.text, fontWeight: "800" },
  impactProgramName: { fontSize: 11, color: Colors.dark.textSecondary, marginTop: 2 },
  impactProgramCounts: { alignItems: "flex-end", gap: 2 },
  impactCountText: { fontSize: 10, color: Colors.dark.tabIconDefault, fontWeight: "700" },
  impactGroupLabel: {
    fontSize: 10, color: Colors.dark.textSecondary, fontWeight: "800",
    letterSpacing: 0.8, textTransform: "uppercase", marginTop: 3,
  },
  impactEmptyText: {
    fontSize: 12, color: Colors.dark.tabIconDefault, fontStyle: "italic",
  },
  impactOfferCard: {
    backgroundColor: Colors.dark.surface, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.dark.border, padding: 11, gap: 7,
  },
  impactOfferHeader: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
  },
  impactOfferActions: {
    flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end",
    gap: 6, maxWidth: "58%",
  },
  impactOfferTitle: { flex: 1, fontSize: 13, color: Colors.dark.text, fontWeight: "800" },
  impactStatusText: {
    fontSize: 9, color: Colors.dark.tint, fontWeight: "800",
    letterSpacing: 0.5, textTransform: "uppercase", marginTop: 3,
  },
  impactOfferDescription: { fontSize: 12, color: Colors.dark.textSecondary, lineHeight: 17 },
  impactDetailRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" },
  impactDetailText: {
    fontSize: 11, color: Colors.dark.textSecondary, fontWeight: "600",
  },
  impactCodeText: {
    fontSize: 11, color: "#FBBF24", fontWeight: "800",
  },
  impactMetaText: { fontSize: 10, color: Colors.dark.tabIconDefault },
  impactAdCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    backgroundColor: Colors.dark.surface, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.dark.border, padding: 10,
  },
  impactCreativePreview: {
    width: 76, height: 60, borderRadius: 7,
    backgroundColor: Colors.dark.background,
  },
  impactUrlText: {
    fontSize: 10, color: Colors.dark.tabIconDefault,
  },
  impactShortlistBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderWidth: 1, borderColor: Colors.dark.tint, borderRadius: 7,
    paddingHorizontal: 7, paddingVertical: 6,
  },
  impactShortlistBtnSelected: {
    backgroundColor: "#34D399", borderColor: "#34D399",
  },
  impactShortlistText: {
    color: Colors.dark.tint, fontSize: 9, fontWeight: "800",
  },
  impactShortlistTextSelected: { color: "#000" },
  impactPreviewBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderWidth: 1, borderColor: Colors.dark.borderStrong, borderRadius: 7,
    backgroundColor: Colors.dark.surfaceLight,
    paddingHorizontal: 7, paddingVertical: 6,
  },
  impactPreviewBtnText: {
    color: Colors.dark.text, fontSize: 9, fontWeight: "800",
  },
  impactSaveBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderWidth: 1, borderColor: "#34D39980", borderRadius: 7,
    backgroundColor: "#34D39918",
    paddingHorizontal: 7, paddingVertical: 6,
  },
  impactUnpublishBtn: {
    borderColor: "#F8717180", backgroundColor: "#F8717118",
  },
  commercialSavedText: {
    color: "#34D399", fontSize: 9, fontWeight: "800", paddingVertical: 6,
  },
  commercialWorkflowBox: {
    gap: 10, padding: 12, borderRadius: 12,
    borderWidth: 1, borderColor: "#34D39950", backgroundColor: "#34D39908",
  },
  commercialOfferRow: {
    gap: 8, padding: 10, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.dark.border, backgroundColor: Colors.dark.surface,
  },
  commercialTargetPicker: {
    gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.dark.border,
  },
  commercialTargetRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: Colors.dark.border,
  },
  commercialAssignmentRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.dark.border,
  },
  commercialAssignmentStatus: {
    color: "#FBBF24", fontSize: 9, fontWeight: "900", letterSpacing: 0.6,
  },
  commercialAssignmentPublished: { color: "#34D399" },
  impactFullInventoryBox: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderWidth: 1, borderColor: "#FBBF2450", borderRadius: 10,
    backgroundColor: "#FBBF2408", padding: 11,
  },
  impactFullTitle: { color: "#FBBF24", fontSize: 12, fontWeight: "800" },
  impactFullSub: {
    color: Colors.dark.tabIconDefault, fontSize: 10, lineHeight: 14, marginTop: 2,
  },
  impactFullBtn: {
    backgroundColor: "#FBBF24", borderRadius: 8,
    paddingHorizontal: 11, paddingVertical: 9,
  },
  impactFullBtnText: { color: "#000", fontSize: 11, fontWeight: "800" },
  impactFullResult: { color: "#34D399", fontSize: 11, textAlign: "center" },
  impactInternalNote: {
    color: Colors.dark.tabIconDefault, fontSize: 10,
    textAlign: "center", lineHeight: 14,
  },
});
