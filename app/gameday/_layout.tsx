import { Stack } from "expo-router";

export default function GamedayLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#09090B" },
      }}
    />
  );
}
