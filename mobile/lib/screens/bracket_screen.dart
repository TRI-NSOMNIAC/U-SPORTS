import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class BracketScreen extends StatelessWidget {
  final String eventId;
  const BracketScreen({super.key, required this.eventId});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.bgPrimary,
      appBar: AppBar(title: const Text('Bracket'), ),
      body: const Center(child: Text('Loading...', style: TextStyle(color: AppTheme.textMuted))),
    );
  }
}
