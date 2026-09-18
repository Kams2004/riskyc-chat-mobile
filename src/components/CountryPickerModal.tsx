import { useMemo, useState } from 'react';
import { FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { COUNTRIES, type Country } from '../lib/countries';
import { useTheme } from '../features/theme/ThemeContext';
import { fonts, type Palette } from '../theme';

/** Shared country-code picker sheet — used by login.tsx's own phone field and new.tsx's phone-search field, so both resolve a bare local number the same way. */
export function CountryPickerModal({ visible, onClose, onSelect }: { visible: boolean; onClose: () => void; onSelect: (country: Country) => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const { t } = useTranslation('auth');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.dialCode.includes(q));
  }, [search]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>
      <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }]}>
        <View style={[styles.sheetHandle, { backgroundColor: colors.hairline }]} />
        <TextInput
          style={[styles.pickerSearch, { borderColor: colors.inputBorder, color: colors.textPrimary }]}
          placeholder={t('login.searchCountry')}
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          autoFocus
        />
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.name}
          keyboardShouldPersistTaps="handled"
          style={{ maxHeight: 420 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.countryItem, { borderBottomColor: colors.hairline }]}
              onPress={() => {
                onSelect(item);
                setSearch('');
                onClose();
              }}
            >
              <Text style={[styles.countryItemName, { color: colors.textPrimary }]}>{item.name}</Text>
              <Text style={[styles.countryItemDial, { color: colors.textMuted }]}>{item.dialCode}</Text>
            </TouchableOpacity>
          )}
        />
      </View>
    </Modal>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
    sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 10, maxHeight: '75%' },
    sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
    pickerSearch: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontFamily: fonts.sans, fontSize: 15, marginBottom: 8 },
    countryItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1 },
    countryItemName: { fontFamily: fonts.sans, fontSize: 15 },
    countryItemDial: { fontFamily: fonts.sansMedium, fontSize: 15 },
  });
}
