import { Tabs } from 'expo-router';
import { Platform, Text, type ColorValue } from 'react-native';
import { colors } from '@/lib/theme';
import { useThemeName } from '@/lib/displayMode';
import { useWide } from '@/lib/useLayout';

function TabIcon({ glyph, color }: { glyph: string; color: ColorValue }) {
  // ︎ asks for the plain text symbol: as an emoji, ⚙ ignores the color and looks always selected.
  return <Text style={{ color, fontSize: 20 }}>{glyph}{'︎'}</Text>;
}

export default function TabsLayout() {
  useThemeName(); // redraw when the display changes (dark / light)
  const wide = useWide();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        // Phones: a bar along the bottom. Wide screens: a navigation rail down the left side.
        tabBarPosition: wide ? 'left' : 'bottom',
        tabBarVariant: wide ? 'material' : 'uikit',
        tabBarStyle: {
          backgroundColor: colors.card, borderTopColor: colors.cardBorder, borderRightColor: colors.cardBorder,
          ...(wide && { paddingTop: 16, minWidth: 96 }),
        },
        // A web page cuts off what doesn't fit: under the icon's 28-pixel box the label gets 10 pixels,
        // too short for its letters. (A phone app lets them show.)
        ...(!wide && Platform.OS === 'web' && { tabBarIconStyle: { height: 24 } }),
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.muted,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Recommendations', tabBarLabel: 'List', tabBarIcon: ({ color }) => <TabIcon glyph="★" color={color} /> }} />
      {/* Wide screens: a shortcut to the List's Priority, indented under List and a little smaller.
          Phones: no button (hidden this way, not with href: null, which also makes the page unreachable). */}
      <Tabs.Screen name="priority" options={{
        title: 'Recommendations › Priority', tabBarLabel: 'Priority', tabBarIcon: ({ color }) => <TabIcon glyph="!" color={color} />, lazy: true,
        ...(wide ? { tabBarItemStyle: { marginLeft: 28 }, tabBarLabelStyle: { fontSize: 13 } } : { tabBarButton: () => null, tabBarItemStyle: { display: 'none' as const } }),
      }} />
      <Tabs.Screen name="series" options={{ title: 'Series', tabBarIcon: ({ color }) => <TabIcon glyph="❐" color={color} /> }} />
      <Tabs.Screen name="categories" options={{ title: 'Categories', tabBarIcon: ({ color }) => <TabIcon glyph="☰" color={color} /> }} />
      <Tabs.Screen name="sheet" options={{ title: 'Sheet', tabBarIcon: ({ color }) => <TabIcon glyph="▦" color={color} /> }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: ({ color }) => <TabIcon glyph="⚙" color={color} /> }} />
    </Tabs>
  );
}
