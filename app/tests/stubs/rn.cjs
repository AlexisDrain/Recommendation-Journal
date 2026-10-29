// The bits of react-native the data code uses: it runs as on a phone.
module.exports = { Platform: { OS: 'ios' }, Alert: { alert() {} }, AppState: { addEventListener: () => ({ remove() {} }) } };
