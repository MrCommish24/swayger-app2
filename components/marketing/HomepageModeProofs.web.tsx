import React from "react";
import { AnswerSelector } from "@/components/fantasy/AnswerSelector";
import { CompactCompetitionReceipt } from "@/components/fantasy/CompactCompetitionReceipt";
import ReceiptCard from "@/components/ReceiptCard";

const fantasyPickOptions = [
  { id: "baltimore", label: "Baltimore", type: "static" as const },
  { id: "cincinnati", label: "Cincinnati", type: "static" as const },
];

const fantasyReceiptExample = {
  finalized: true,
  league_name: "Sunday Picks League",
  season_year: 2026,
  week_number: 5,
  winners: [
    { display_name: "Maya", team_name: "Northside", points: 8, correct_count: 6, rank: 1, rank_label: "#1" },
  ],
  leaderboard: [
    { display_name: "Maya", team_name: "Northside", points: 8, correct_count: 6, rank: 1, rank_label: "#1" },
    { display_name: "Jordan", team_name: "Red Zone", points: 6, correct_count: 5, rank: 2, rank_label: "#2" },
  ],
};

export function FantasyModeProof() {
  return (
    <div className="mode-proof-stack">
      <div className="mode-proof-label">
        <span>FANTASY WEEKLY PICK</span>
        <span>LOCKED EXAMPLE</span>
      </div>
      <div className="mode-proof-picker">
        <p style={{ color: "#fafafa", marginBottom: 12 }}>Who wins the AFC North?</p>
        <AnswerSelector
          options={fantasyPickOptions}
          selectedId="baltimore"
          isLocked
          question="Who wins the AFC North?"
          onSelect={() => undefined}
          pickStatus="saved"
        />
      </div>
      <div className="mode-proof-label">
        <span>FINAL STANDINGS</span>
        <span>EXAMPLE DATA</span>
      </div>
      <CompactCompetitionReceipt data={fantasyReceiptExample} variant="weekly" />
    </div>
  );
}

export function OneVsOneModeProof() {
  return (
    <div className="mode-proof-single">
      <ReceiptCard
        title="Will Baltimore win the AFC North?"
        category="Sports"
        creatorUsername="maya"
        creatorDisplayName="Maya"
        opponentUsername="jordan"
        opponentDisplayName="Jordan"
        creatorPick="Yes"
        opponentPick="No"
        outcome="creator"
        stakeUnits={25}
      />
    </div>
  );
}
