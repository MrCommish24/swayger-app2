import { Stack } from "expo-router";

export default function WeeklyLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="setup" />
      <Stack.Screen name="play" />
      <Stack.Screen name="settle" />
      <Stack.Screen name="results" />
    </Stack>
  );
}
