import { Stack } from "expo-router";

export default function DraftDayLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[seasonId]" />
    </Stack>
  );
}
