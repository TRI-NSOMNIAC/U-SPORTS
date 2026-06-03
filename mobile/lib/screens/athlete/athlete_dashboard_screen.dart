import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../providers/auth_provider.dart';
import '../../theme/app_theme.dart';
import '../../utils/format_helpers.dart';
import '../../utils/sport_helpers.dart';
import '../../widgets/stat_chip.dart';

class AthleteDashboardScreen extends ConsumerWidget {
  const AthleteDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final athleteAsync = ref.watch(athleteRowProvider);

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        title: const Text('Dashboard'),
        actions: [
          IconButton(
            icon: const Icon(Icons.notifications_outlined),
            onPressed: () => context.push('/notifications'),
          ),
        ],
      ),
      body: athleteAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (athlete) {
          if (athlete == null) {
            return const Center(child: Text('Athlete profile not found.'));
          }
          return _AthleteDashboardBody(athleteId: athlete.id, sport: athlete.sport);
        },
      ),
    );
  }
}

class _AthleteDashboardBody extends ConsumerStatefulWidget {
  const _AthleteDashboardBody({required this.athleteId, required this.sport});

  final String athleteId;
  final String sport;

  @override
  ConsumerState<_AthleteDashboardBody> createState() => _AthleteDashboardBodyState();
}

class _AthleteDashboardBodyState extends ConsumerState<_AthleteDashboardBody> {
  List<Map<String, dynamic>> _stats = [];
  List<Map<String, dynamic>> _matches = [];
  List<Map<String, dynamic>> _roster = [];
  bool _loading = true;
  RealtimeChannel? _liveRefreshChannel;
  Timer? _livePoll;

  void _syncLiveSchedulePolling() {
    _livePoll?.cancel();
    _livePoll = null;
    final hasLive = _matches.any((m) => m['status'] == 'live');
    if (!hasLive) return;
    _livePoll = Timer.periodic(const Duration(seconds: 2), (_) => _load());
  }

  @override
  void initState() {
    super.initState();
    _load();
    _liveRefreshChannel = Supabase.instance.client.channel('athlete-dash-${widget.athleteId}')
      ..onPostgresChanges(
        event: PostgresChangeEvent.all,
        schema: 'public',
        table: 'match_scores',
        callback: (_) => _load(),
      )
      ..onPostgresChanges(
        event: PostgresChangeEvent.all,
        schema: 'public',
        table: 'matches',
        callback: (_) => _load(),
      )
      ..onPostgresChanges(
        event: PostgresChangeEvent.all,
        schema: 'public',
        table: 'scoring_actions',
        callback: (_) => _load(),
      )
      ..subscribe();
  }

  @override
  void dispose() {
    _livePoll?.cancel();
    _liveRefreshChannel?.unsubscribe();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final stats = await Supabase.instance.client
          .from('player_season_stats')
          .select('*, season:seasons(id, name, status)')
          .eq('athlete_id', widget.athleteId)
          .order('updated_at', ascending: false);
      final tm = await Supabase.instance.client.from('team_members').select('team_id').eq('athlete_id', widget.athleteId);
      final teamIds = [...(tm as List).map((e) => (e as Map)['team_id'] as String)];

      List<Map<String, dynamic>> upcoming = [];
      List<Map<String, dynamic>> members = [];

      if (teamIds.isNotEmpty) {
        final raw = await Supabase.instance.client
            .from('matches')
            .select('id, event_id, scheduled_at, venue, status, participant_a_id, participant_b_id, event:events(name, sport)')
            .inFilter('status', ['scheduled', 'live'])
            .limit(96);
        final mine = (raw as List).map((e) => Map<String, dynamic>.from(e as Map)).where((m) {
          final a = m['participant_a_id'] as String?;
          final b = m['participant_b_id'] as String?;
          return (a != null && teamIds.contains(a)) || (b != null && teamIds.contains(b));
        }).toList();
        mine.sort((a, b) {
          final la = a['status'] == 'live';
          final lb = b['status'] == 'live';
          if (la && !lb) return -1;
          if (!la && lb) return 1;
          final ta = DateTime.tryParse(a['scheduled_at'] as String? ?? '')?.millisecondsSinceEpoch ?? 0;
          final tb = DateTime.tryParse(b['scheduled_at'] as String? ?? '')?.millisecondsSinceEpoch ?? 0;
          return ta.compareTo(tb);
        });
        upcoming = mine.take(6).toList();

        final mem = await Supabase.instance.client
            .from('team_members')
            .select(
              '''
            team_id,
            athlete:athletes(id, position, jersey_number, profile:profiles!athletes_profile_id_fkey(full_name)),
            team:teams(name, sport)
          ''',
            )
            .inFilter('team_id', teamIds);
        members = (mem as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
      }

      if (!mounted) return;
      setState(() {
        _stats = (stats as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
        _matches = upcoming;
        _roster = members;
        _loading = false;
      });
      _syncLiveSchedulePolling();
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    final row = _stats.isNotEmpty ? _stats.first : null;
    final gp = (row?['games_played'] as num?)?.toInt() ?? 0;
    final rawStats = row?['stats'] as Map<String, dynamic>?;
    final highlights = seasonStatHighlights(widget.sport, rawStats, gp);
    final prof = ref.watch(profileProvider).valueOrNull;

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Welcome, ${prof?.fullName ?? 'Athlete'}', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
          const SizedBox(height: 16),
          Row(
            children: [
              FilledButton(
                onPressed: () => context.push('/athlete/profile'),
                child: const Text('My profile'),
              ),
              const SizedBox(width: 10),
              OutlinedButton(
                onPressed: () => context.go('/'),
                child: const Text('Hub'),
              ),
            ],
          ),
          if (row != null) ...[
            const SizedBox(height: 24),
            const Text('Season snapshot', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                StatChip(label: 'GP', value: '$gp'),
                ...highlights.take(3).map((h) => StatChip(label: h.label, value: h.value)),
              ],
            ),
          ],
          const SizedBox(height: 24),
          const Text('Upcoming & live', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
          const SizedBox(height: 8),
          if (_matches.isEmpty)
            const Text('No scheduled matches yet.', style: TextStyle(color: AppTheme.textMuted))
          else
            ..._matches.map((m) {
              final ev = m['event'] as Map<String, dynamic>?;
              final title = ev?['name'] as String? ?? 'Match';
              return Card(
                child: ListTile(
                  title: Text(title),
                  subtitle: Text('${matchStatusLabel(m['status'] as String? ?? '')} · ${formatDateTime(m['scheduled_at'] as String?)}'),
                  onTap: m['event_id'] != null ? () => context.push('/events/${m['event_id']}') : null,
                ),
              );
            }),
          const SizedBox(height: 24),
          const Text('Roster peers', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
          const SizedBox(height: 8),
          if (_roster.isEmpty)
            const Text('No team assignments yet.', style: TextStyle(color: AppTheme.textMuted))
          else
            ..._roster.take(12).map((r) {
              final team = r['team'] as Map<String, dynamic>?;
              final ath = r['athlete'] as Map<String, dynamic>?;
              final p = ath?['profile'] as Map<String, dynamic>?;
              final name = p?['full_name'] as String? ?? 'Teammate';
              return ListTile(
                dense: true,
                title: Text(name),
                subtitle: Text(team?['name'] as String? ?? ''),
              );
            }),
        ],
      ),
    );
  }
}
