import { Stack } from "expo-router";

export default function RoomLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#09090B" },
      }}
    />
  );
}
