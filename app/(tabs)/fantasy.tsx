import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppSectionHeader from "@/components/AppSectionHeader";
import FantasyLeaguesSection from "@/components/FantasyLeaguesSection";
import Colors from "@/constants/colors";

export default function FantasyScreen() {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingBottom: insets.bottom + 100,
      }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <AppSectionHeader title="FANTASY" />
      </View>
      <View style={styles.content}>
        <FantasyLeaguesSection />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  header: { marginHorizontal: 20, paddingTop: 8, paddingBottom: 10 },
  content: { paddingHorizontal: 16 },
});
