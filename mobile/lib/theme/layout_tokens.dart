import 'package:flutter/material.dart';

/// Web-like surfaces: guest shell uses dark canvas + elevated cards.
class LayoutTokens {
  LayoutTokens._();

  /// Bracket canvas (matches web `BracketView` wrapper).
  static const Color bracketCanvas = Color(0xFF111118);

  static Color cardBackground(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return dark ? const Color(0xFF16161E) : Colors.white;
  }

  static Color borderSubtle(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return dark ? const Color(0x14FFFFFF) : const Color(0x1A000000);
  }

  static Color secondaryText(BuildContext context) {
    return Theme.of(context).brightness == Brightness.dark
        ? const Color(0xFF8888A0)
        : const Color(0xFF55556A);
  }

  static Color mutedText(BuildContext context) {
    return Theme.of(context).brightness == Brightness.dark
        ? const Color(0xFF55556A)
        : const Color(0xFF6B6B7E);
  }
}
