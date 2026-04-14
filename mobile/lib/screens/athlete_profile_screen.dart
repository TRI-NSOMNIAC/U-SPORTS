import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class AthleteProfileScreen extends StatelessWidget {
  final String athleteId;
  const AthleteProfileScreen({super.key, required this.athleteId});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.bgPrimary,
      appBar: AppBar(title: const Text('AthleteProfile'), ),
      body: const Center(child: Text('Loading...', style: TextStyle(color: AppTheme.textMuted))),
    );
  }
}
