import { Stack } from "expo-router";

export default function FantasyLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="setup" />
      <Stack.Screen name="join" />
      <Stack.Screen name="draft-day" />
      <Stack.Screen name="weeks" />
      <Stack.Screen name="standings" />
      <Stack.Screen name="manage" />
      <Stack.Screen name="recover" />
    </Stack>
  );
}
