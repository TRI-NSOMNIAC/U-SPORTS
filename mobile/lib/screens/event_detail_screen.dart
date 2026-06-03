import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../providers/events_api_provider.dart';
import '../theme/app_theme.dart';
import '../theme/layout_tokens.dart';
import '../utils/event_placements.dart';
import '../utils/format_helpers.dart';
import '../utils/participant_labels.dart';
import '../utils/sport_helpers.dart';
import '../widgets/tournament_bracket_view.dart';

class EventDetailScreen extends ConsumerStatefulWidget {
  const EventDetailScreen({super.key, required this.eventId, this.initialTab = 0});

  final String eventId;
  final int initialTab;

  @override
  ConsumerState<EventDetailScreen> createState() => _EventDetailScreenState();
}

class _EventDetailScreenState extends ConsumerState<EventDetailScreen> with SingleTickerProviderStateMixin {
  late TabController _tabs;
  Map<String, String> _labels = {};
  String _labelSig = '';

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this, initialIndex: widget.initialTab.clamp(0, 1));
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  Future<void> _resolveLabels(
    List<Map<String, dynamic>> brackets,
    List<Map<String, dynamic>> matches,
    Map<String, dynamic>? event,
  ) async {
    final ids = <String>{
      ...collectBracketParticipantIds(brackets),
      ...matches
          .expand((m) => [m['participant_a_id'], m['participant_b_id']])
          .whereType<String>()
          .where((id) => id.isNotEmpty),
      ...collectEventParticipantIds(event),
    };
    final sig = ids.join(',');
    if (sig == _labelSig) return;
    _labelSig = sig;
    if (ids.isEmpty) {
      if (mounted) setState(() => _labels = {});
      return;
    }
    final map = await fetchParticipantLabels(ids.toList());
    if (mounted) setState(() => _labels = map);
  }

  String _slotLabel(String? id) => participantDisplayLabel(_labels, id);

  String? _participantIdForMatch(Map<String, dynamic> match, List<Map<String, dynamic>> brackets, String slot) {
    final direct = slot == 'a' ? match['participant_a_id'] : match['participant_b_id'];
    if (direct is String && direct.isNotEmpty) return direct;
    final bracketId = match['bracket_id'] as String?;
    if (bracketId == null) return null;
    for (final b in brackets) {
      if (b['id'] == bracketId) {
        final id = slot == 'a' ? b['participant_a_id'] : b['participant_b_id'];
        if (id is String && id.isNotEmpty) return id;
      }
    }
    return null;
  }

  void _showMatchSheet(BuildContext context, String matchId) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        return DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.5,
          minChildSize: 0.35,
          maxChildSize: 0.92,
          builder: (_, scroll) {
            return Consumer(
              builder: (context, ref, _) {
                final st = ref.watch(scoringStateProvider(matchId));
                return st.when(
                  loading: () => const Padding(
                    padding: EdgeInsets.all(24),
                    child: Center(child: CircularProgressIndicator()),
                  ),
                  error: (e, _) => Padding(padding: const EdgeInsets.all(24), child: Text('$e')),
                  data: (data) {
                    final names = data['participantNames'] as Map<String, dynamic>? ?? {};
                    final match = data['match'] as Map<String, dynamic>? ?? {};
                    final sport = match['sport'] as String? ?? '';
                    final scores = (data['scores'] as List<dynamic>? ?? []).map((e) => Map<String, dynamic>.from(e as Map)).toList();
                    return ListView(
                      controller: scroll,
                      padding: const EdgeInsets.all(20),
                      children: [
                        Text(
                          '${names['a'] ?? 'Side A'} vs ${names['b'] ?? 'Side B'}',
                          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18),
                        ),
                        const SizedBox(height: 8),
                        Text(matchStatusLabel(match['status'] as String? ?? ''), style: const TextStyle(color: AppTheme.textSecondary)),
                        const SizedBox(height: 16),
                        if (scores.isNotEmpty)
                          Text(
                            'Current score data loaded. Sport: ${sportLabel(sport)}',
                            style: const TextStyle(fontSize: 13),
                          ),
                        const SizedBox(height: 12),
                        TextButton.icon(
                          onPressed: () => ref.invalidate(scoringStateProvider(matchId)),
                          icon: const Icon(Icons.refresh),
                          label: const Text('Refresh'),
                        ),
                      ],
                    );
                  },
                );
              },
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final evAsync = ref.watch(eventDetailProvider(widget.eventId));
    final brAsync = ref.watch(bracketsForEventProvider(widget.eventId));
    final mtAsync = ref.watch(matchesForEventProvider(widget.eventId));

    return evAsync.when(
      loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (e, _) => Scaffold(body: Center(child: Text('$e'))),
      data: (event) {
        if (event == null) {
          return const Scaffold(body: Center(child: Text('Event not found')));
        }
        final sport = event['sport'] as String? ?? '';
        final name = event['name'] as String? ?? 'Event';
        final status = event['status'] as String? ?? '';
        final desc = event['description'] as String?;

        final brackets = brAsync.valueOrNull ?? [];
        final matches = mtAsync.valueOrNull ?? [];
        WidgetsBinding.instance.addPostFrameCallback((_) {
          _resolveLabels(brackets, matches, event);
        });
        final podium = deriveEliminationPodium(brackets);

        return Scaffold(
          backgroundColor: Theme.of(context).scaffoldBackgroundColor,
          appBar: AppBar(
            title: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis),
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
            bottom: TabBar(
              controller: _tabs,
              tabs: [
                const Tab(text: 'Bracket'),
                Tab(text: 'Matches (${matches.length})'),
              ],
            ),
          ),
          body: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(sportEmoji(sport), style: const TextStyle(fontSize: 22)),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            '${sportLabel(sport)} · ${formatEnumLabel(event['format'] as String? ?? '')}',
                            style: const TextStyle(color: AppTheme.textSecondary, fontSize: 13),
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: AppTheme.accent.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            eventLifecycleLabel(status),
                            style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppTheme.accent),
                          ),
                        ),
                      ],
                    ),
                    if (desc != null && desc.trim().isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 10),
                        child: Text(desc, style: const TextStyle(fontSize: 13)),
                      ),
                    if (podium != null && status == 'completed') ...[
                      const SizedBox(height: 12),
                      ...podium.map((p) {
                        final label = _slotLabel(p.participantId);
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 4),
                          child: Text('${placementRankLabel(p.rank)}: $label',
                              style: const TextStyle(fontWeight: FontWeight.w700)),
                        );
                      }),
                    ],
                  ],
                ),
              ),
              Expanded(
                child: TabBarView(
                  controller: _tabs,
                  children: [
                    RefreshIndicator(
                      onRefresh: () async {
                        ref.invalidate(bracketsForEventProvider(widget.eventId));
                        ref.invalidate(eventDetailProvider(widget.eventId));
                      },
                      child: brackets.isEmpty
                          ? ListView(
                              physics: const AlwaysScrollableScrollPhysics(),
                              children: const [
                                SizedBox(height: 48),
                                Center(child: Text('No bracket generated yet.', style: TextStyle(color: AppTheme.textMuted))),
                              ],
                            )
                          : Padding(
                              padding: const EdgeInsets.all(16),
                              child: TournamentBracketView(
                                brackets: brackets,
                                matches: matches,
                                participantLabels: _labels,
                                onMatchTap: (m) {
                                  final id = m['id'] as String?;
                                  if (id != null) _showMatchSheet(context, id);
                                },
                              ),
                            ),
                    ),
                    RefreshIndicator(
                      onRefresh: () async {
                        ref.invalidate(matchesForEventProvider(widget.eventId));
                      },
                      child: matches.isEmpty
                          ? ListView(
                              children: const [
                                SizedBox(height: 48),
                                Center(child: Text('No matches scheduled.', style: TextStyle(color: AppTheme.textMuted))),
                              ],
                            )
                          : ListView.separated(
                              padding: const EdgeInsets.all(16),
                              itemCount: matches.length,
                              separatorBuilder: (_, __) => const SizedBox(height: 8),
                              itemBuilder: (ctx, i) {
                                final m = matches[i];
                                final a = _participantIdForMatch(m, brackets, 'a');
                                final bId = _participantIdForMatch(m, brackets, 'b');
                                final na = _slotLabel(a);
                                final nb = _slotLabel(bId);
                                final st = m['status'] as String? ?? '';
                                final mid = m['id'] as String;
                                return Material(
                                  color: LayoutTokens.cardBackground(context),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(12),
                                    side: BorderSide(color: LayoutTokens.borderSubtle(context)),
                                  ),
                                  child: ListTile(
                                    title: Text('$na vs $nb'),
                                    subtitle: Text(
                                      '${matchStatusLabel(st)}${m['scheduled_at'] != null ? ' · ${formatDateTime(m['scheduled_at'] as String?)}' : ''}',
                                    ),
                                    trailing: st == 'live'
                                        ? TextButton(
                                            onPressed: () => _showMatchSheet(context, mid),
                                            child: const Text('Live'),
                                          )
                                        : st == 'scheduled' || st == 'completed'
                                            ? IconButton(
                                                icon: const Icon(Icons.info_outline),
                                                onPressed: () => _showMatchSheet(context, mid),
                                              )
                                            : null,
                                  ),
                                );
                              },
                            ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
