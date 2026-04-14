import { Stack } from "expo-router";
import Colors from "@/constants/colors";

export default function PlayoffsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.dark.background },
        animation: "slide_from_right",
      }}
    />
  );
}
