import { Stack } from "expo-router";

export default function DraftDaySeasonLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="play" />
    </Stack>
  );
}
