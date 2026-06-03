import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../providers/tryouts_api_provider.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import '../../utils/format_helpers.dart';
import '../../utils/sport_helpers.dart';

class TryoutRegistryScreen extends ConsumerWidget {
  const TryoutRegistryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final open = ref.watch(openTryoutEventsProvider);
    final mine = ref.watch(myTryoutRegistrationsProvider);
    final api = ref.watch(apiClientProvider);
    final regs = mine.valueOrNull ?? [];

    bool blockedFor(Map<String, dynamic> ev) {
      final sid = ev['season_id'];
      final eid = ev['id'];
      for (final r in regs) {
        if (r['season_id'] == sid &&
            r['event_id'] != eid &&
            (r['status'] == 'registered' || r['status'] == 'selected')) {
          return true;
        }
      }
      return false;
    }

    return DefaultTabController(
      length: 2,
      child: Scaffold(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        appBar: AppBar(
          title: const Text('Tryout registry'),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: () {
              if (context.canPop()) {
                context.pop();
              } else {
                context.go('/');
              }
            },
          ),
          bottom: const TabBar(
            tabs: [
              Tab(text: 'Open tryouts'),
              Tab(text: 'My registrations'),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            open.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(child: Text('$e')),
              data: (events) {
                if (events.isEmpty) {
                  return const Center(child: Text('No tryouts open for registration.', style: TextStyle(color: AppTheme.textMuted)));
                }
                return ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: events.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (ctx, i) {
                    final ev = events[i];
                    final id = ev['id'] as String;
                    final sport = ev['sport'] as String? ?? '';
                    final blocked = blockedFor(ev);
                    return Material(
                      color: AppTheme.surfaceCard,
                      borderRadius: BorderRadius.circular(12),
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(ev['name'] as String? ?? 'Tryout', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                            const SizedBox(height: 6),
                            Text('${sportLabel(sport)} · ${eventLifecycleLabel(ev['status'] as String? ?? '')}',
                                style: const TextStyle(color: AppTheme.textSecondary, fontSize: 13)),
                            if (blocked)
                              const Padding(
                                padding: EdgeInsets.only(top: 8),
                                child: Text(
                                  'You already have an active tryout registration for another sport this season.',
                                  style: TextStyle(fontSize: 12, color: AppTheme.textMuted),
                                ),
                              ),
                            Align(
                              alignment: Alignment.centerRight,
                              child: FilledButton(
                                onPressed: blocked
                                    ? null
                                    : () async {
                                        try {
                                          await api.postJson('/events/$id/tryout/register');
                                          ref.invalidate(myTryoutRegistrationsProvider);
                                          ref.invalidate(openTryoutEventsProvider);
                                          if (context.mounted) {
                                            ScaffoldMessenger.of(context).showSnackBar(
                                              const SnackBar(content: Text('Registered successfully.')),
                                            );
                                          }
                                        } catch (e) {
                                          if (context.mounted) {
                                            ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
                                          }
                                        }
                                      },
                                child: const Text('Register'),
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                );
              },
            ),
            mine.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(child: Text('$e')),
              data: (rows) {
                if (rows.isEmpty) {
                  return const Center(child: Text('No registrations yet.', style: TextStyle(color: AppTheme.textMuted)));
                }
                return ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: rows.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (ctx, i) {
                    final r = rows[i];
                    final st = r['status'] as String? ?? '';
                    return Material(
                      color: AppTheme.surfaceCard,
                      borderRadius: BorderRadius.circular(12),
                      child: ListTile(
                        title: Text(tryoutRegistrationLabel(st), style: const TextStyle(fontWeight: FontWeight.w800)),
                        subtitle: Text(
                          '${sportLabel(r['sport'] as String? ?? '')} · Updated ${formatDateTime(r['updated_at'] as String?)}',
                          style: const TextStyle(fontSize: 12),
                        ),
                      ),
                    );
                  },
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}
