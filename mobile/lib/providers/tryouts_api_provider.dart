import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../services/api_service.dart';

final openTryoutEventsProvider = StreamProvider<List<Map<String, dynamic>>>((ref) {
  final ctrl = StreamController<List<Map<String, dynamic>>>();

  Future<void> load() async {
    try {
      final api = ref.read(apiClientProvider);
      final data = await api.getJson('/events', query: {'isTryout': 'true', 'status': 'registration'});
      if (ctrl.isClosed) return;
      if (data is! List) {
        ctrl.add([]);
        return;
      }
      ctrl.add(data.map((e) => Map<String, dynamic>.from(e as Map)).toList());
    } catch (e, st) {
      if (!ctrl.isClosed) ctrl.addError(e, st);
    }
  }

  final ch = Supabase.instance.client.channel('mobile-open-tryouts')
    ..onPostgresChanges(
      event: PostgresChangeEvent.all,
      schema: 'public',
      table: 'events',
      callback: (_) => load(),
    )
    ..subscribe();

  load();
  ref.onDispose(() async {
    await ch.unsubscribe();
    await ctrl.close();
  });
  return ctrl.stream;
});

final myTryoutRegistrationsProvider = StreamProvider<List<Map<String, dynamic>>>((ref) {
  final ctrl = StreamController<List<Map<String, dynamic>>>();

  Future<void> load() async {
    try {
      final api = ref.read(apiClientProvider);
      final data = await api.getJson('/tryouts/my');
      if (ctrl.isClosed) return;
      if (data is! List) {
        ctrl.add([]);
        return;
      }
      ctrl.add(data.map((e) => Map<String, dynamic>.from(e as Map)).toList());
    } catch (_) {
      if (!ctrl.isClosed) ctrl.add([]);
    }
  }

  final ch = Supabase.instance.client.channel('mobile-my-tryouts')
    ..onPostgresChanges(
      event: PostgresChangeEvent.all,
      schema: 'public',
      table: 'tryout_registrations',
      callback: (_) => load(),
    )
    ..onPostgresChanges(
      event: PostgresChangeEvent.all,
      schema: 'public',
      table: 'events',
      callback: (_) => load(),
    )
    ..subscribe();

  load();
  ref.onDispose(() async {
    await ch.unsubscribe();
    await ctrl.close();
  });
  return ctrl.stream;
});
