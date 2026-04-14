import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class EventsScreen extends StatelessWidget {
  
  const EventsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.bgPrimary,
      appBar: AppBar(title: const Text('Events'), ),
      body: const Center(child: Text('Loading...', style: TextStyle(color: AppTheme.textMuted))),
    );
  }
}
