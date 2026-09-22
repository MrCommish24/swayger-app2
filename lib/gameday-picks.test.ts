import {
  buildPickPayload,
  isPropAnswered,
  parseIntegerPick,
} from "@/lib/gameday-picks";
import type { GDProp } from "@/lib/gameday-api";
import { readFile } from "node:fs/promises";

const integerProp: GDProp = {
  id: "bonus-total",
  card_id: "card",
  question: "Total points in the Bonus Game?",
  answer_options: [],
  correct_answer: null,
  answer_type: "integer",
  prop_role: "bonus_total",
  numeric_min: 0,
  numeric_max: 200,
  status: "pending",
  display_order: 4,
};

const choiceProp: GDProp = {
  ...integerProp,
  id: "main-matchup",
  question: "Who wins?",
  answer_options: ["A", "B"],
  answer_type: "choice",
  prop_role: "main_matchup",
};

function expect(label: string, condition: boolean): void {
  if (!condition) throw new Error(`Failed: ${label}`);
}

expect("choice picks remain answered by selected option", isPropAnswered(choiceProp, "A"));
expect("integer prop renders 54 as a valid answer", isPropAnswered(integerProp, "54"));
expect("0 is a valid integer answer", isPropAnswered(integerProp, "0"));
expect("200 is a valid integer answer", isPropAnswered(integerProp, "200"));
expect("missing integer answer is unanswered", !isPropAnswered(integerProp, undefined));
expect("blank integer answer is unanswered", !isPropAnswered(integerProp, ""));
expect("negative integer is rejected", !isPropAnswered(integerProp, "-1"));
expect("over-max integer is rejected", !isPropAnswered(integerProp, "201"));
expect("decimal integer is rejected", !isPropAnswered(integerProp, "54.5"));
expect("numeric string parses to number", parseIntegerPick(integerProp, "54") === 54);
expect("numeric whitespace is normalized before parsing", parseIntegerPick(integerProp, " 54 ") === 54);
expect(
  "integer payload uses numeric_answer",
  JSON.stringify(buildPickPayload(integerProp, "54")) ===
    JSON.stringify({ numeric_answer: 54 }),
);
expect(
  "zero payload stays numeric zero",
  JSON.stringify(buildPickPayload(integerProp, "0")) ===
    JSON.stringify({ numeric_answer: 0 }),
);
expect(
  "invalid integer payload is rejected",
  buildPickPayload(integerProp, "54.5") === null,
);
expect(
  "choice payload uses selected_answer",
  JSON.stringify(buildPickPayload(choiceProp, "A")) ===
    JSON.stringify({ selected_answer: "A" }),
);
expect("empty choice payload is rejected", buildPickPayload(choiceProp, "") === null);

async function main() {
  const participantScreen = await readFile(
    new URL("../app/gameday/[roomId]/index.tsx", import.meta.url),
    "utf8",
  );
  expect(
    "participant screen renders a dedicated integer TextInput",
    participantScreen.includes('prop.answer_type === "integer"') &&
      participantScreen.includes("<TextInput"),
  );
  expect(
    "participant screen uses the typed numeric write field",
    participantScreen.includes("numeric_answer") &&
      participantScreen.includes("buildPickPayload"),
  );
  expect(
    "participant screen repopulates from authoritative numeric details",
    participantScreen.includes("data.my_pick_details") &&
      participantScreen.includes("String(detail.numeric_answer)"),
  );
  expect(
    "participant screen displays numeric picks after locking",
    participantScreen.includes("Total Points:") &&
      participantScreen.includes("correct_numeric_answer"),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});