import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../theme/app_theme.dart';

const _kDarkMode = 'appearance_dark_mode';

final appearanceDarkModeProvider = NotifierProvider<AppearanceDarkModeNotifier, bool>(
  AppearanceDarkModeNotifier.new,
);

class AppearanceDarkModeNotifier extends Notifier<bool> {
  @override
  bool build() {
    Future.microtask(_load);
    return false;
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final v = prefs.getBool(_kDarkMode) ?? false;
    state = v;
  }

  Future<void> setDark(bool dark) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_kDarkMode, dark);
    state = dark;
  }

  Future<void> toggle() => setDark(!state);
}

final appThemeProvider = Provider<ThemeData>((ref) {
  final dark = ref.watch(appearanceDarkModeProvider);
  return dark ? AppTheme.dark() : AppTheme.light();
});
