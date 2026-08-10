import { Stack } from "expo-router";

export default function FantasyLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="setup" />
    </Stack>
  );
}
