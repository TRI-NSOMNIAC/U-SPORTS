import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../providers/appearance_provider.dart';
import '../theme/app_theme.dart';

enum SettingsShell { guest, student, athlete }

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key, required this.shell});

  final SettingsShell shell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dark = ref.watch(appearanceDarkModeProvider);
    final title = switch (shell) {
      SettingsShell.guest => 'Settings',
      SettingsShell.student => 'Student settings',
      SettingsShell.athlete => 'Athlete settings',
    };

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(title: Text(title)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Appearance', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          SwitchListTile(
            title: const Text('Dark mode'),
            subtitle: const Text('Easier on the eyes in low light'),
            value: dark,
            onChanged: (_) => ref.read(appearanceDarkModeProvider.notifier).toggle(),
          ),
          if (shell != SettingsShell.guest) ...[
            const Divider(height: 32),
            Text('Account', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            ListTile(
              leading: const Icon(Icons.logout, color: AppTheme.danger),
              title: const Text('Sign out', style: TextStyle(color: AppTheme.danger, fontWeight: FontWeight.w700)),
              onTap: () async {
                await Supabase.instance.client.auth.signOut();
                if (context.mounted) context.go('/');
              },
            ),
          ],
        ],
      ),
    );
  }
}
