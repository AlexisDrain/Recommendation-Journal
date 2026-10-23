import { useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { GoogleSheetCard } from '@/components/GoogleSheetCard';
import { Button, Card, Chip, ErrorBox, Muted, styles } from '@/components/ui';
import { exportCsv, exportXlsx, pickAndImport } from '@/db/exchange';
import { requestSync } from '@/db/sync';
import buildInfo from '@/lib/buildInfo.json';
import { DAY_ENDS, DAY_STARTS, setDisplayMode, useDisplayMode, useThemeName, type DisplayMode } from '@/lib/displayMode';
import { REPO_URL } from '@/lib/links';
import { colors } from '@/lib/theme';
import { NARROW_PAGE, page } from '@/lib/useLayout';
import { setWelcomeSeen } from '@/lib/welcome';

const DISPLAY_MODES: [DisplayMode, string][] = [['dark', 'Dark'], ['light', 'Light'], ['auto', 'Light by day, dark at night']];
const hour = (h: number) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;

export default function SettingsScreen() {
  useThemeName(); // redraw when the display changes (dark / light)
  const [error, setError] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<'xlsx' | 'csv' | 'import' | null>(null);
  const display = useDisplayMode();

  const run = async (what: 'xlsx' | 'csv' | 'import', fn: () => Promise<void>) => {
    setBusy(what);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const importFile = () => run('import', async () => {
    setImportMsg(null);
    const r = await pickAndImport();
    if (!r) return;
    requestSync();
    setImportMsg(
      `Added ${r.added} recommendation${r.added === 1 ? '' : 's'}` +
      (r.skipped ? ` · ${r.skipped} already on your list (kept as is)` : '') +
      (r.categoriesAdded.length ? ` · new categories: ${r.categoriesAdded.join(', ')}` : '') +
      (r.added + r.skipped === 0 ? '. No rows with a Title (or Name) column were found.' : '.'),
    );
  });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.scroll, page(NARROW_PAGE)]}>
      {error && <ErrorBox message={error} />}

      <Card title="Display">
        <View style={styles.chips}>
          {DISPLAY_MODES.map(([m, label]) => (
            <Chip key={m} label={label} selected={display === m} onPress={() => setDisplayMode(m).catch((e) => setError((e as Error).message))} />
          ))}
        </View>
        <Muted>
          {display === 'auto'
            ? `Light from ${hour(DAY_STARTS)} to ${hour(DAY_ENDS)}, dark the rest of the time.`
            : display === 'light' ? 'Light all the time.' : 'Dark all the time, easy on the eyes.'}
        </Muted>
      </Card>

      <GoogleSheetCard />

      <Card title="Your data">
        <Muted>Everything is stored only on this device.</Muted>
        <Muted>
          Export as a spreadsheet (.xlsx) with one tab per category, for Google Sheets / Excel, or as one CSV
          file for backups and moving to a new device.
        </Muted>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><Button title="Export .xlsx" onPress={() => run('xlsx', exportXlsx)} busy={busy === 'xlsx'} small /></View>
          <View style={{ flex: 1 }}><Button title="Export CSV" onPress={() => run('csv', exportCsv)} busy={busy === 'csv'} small /></View>
        </View>
        <Muted>
          Import an .xlsx or CSV: an export from this app, or your own list. Columns are found by name (Title or
          Name, Status, Rating, Recommended by, Why or Notes…), each tab becomes a category, and things already on
          your list are skipped.
        </Muted>
        <Button title="Import .xlsx or CSV" onPress={importFile} busy={busy === 'import'} small color={colors.chip} textColor={colors.text} />
        {importMsg && <Text style={{ color: colors.success }}>{importMsg}</Text>}
      </Card>

      <Card title="Welcome screen">
        <Muted>The short overview of what the app is for, shown the first time you opened it.</Muted>
        <Button title="Show the welcome again" onPress={() => setWelcomeSeen(false)} small
          color={colors.chip} textColor={colors.text} />
      </Card>

      <Card title="About">
        {/* The build number goes up with every release (scripts/release.js): compare it between devices. */}
        <Text style={{ color: colors.text }} selectable>
          Recommendation Journal {buildInfo.version} · build {buildInfo.build}
        </Text>
        <Muted>Published {buildInfo.date || 'from a development copy'}</Muted>
        <Muted>
          For support and to report issues, go to{' '}
          <Text style={{ color: colors.accent, textDecorationLine: 'underline' }} accessibilityRole="link"
            onPress={() => Linking.openURL(REPO_URL).catch(() => {})}>
            {REPO_URL.replace('https://', '')}
          </Text>
          .
        </Muted>
      </Card>
    </ScrollView>
  );
}
