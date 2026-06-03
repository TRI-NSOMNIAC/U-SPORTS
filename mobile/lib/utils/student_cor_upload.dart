import 'dart:io';

import 'package:supabase_flutter/supabase_flutter.dart';

const maxCorBytes = 5 * 1024 * 1024;

class CorDocument {
  CorDocument({required this.fileUrl, this.uploadedAt});
  final String fileUrl;
  final String? uploadedAt;

  factory CorDocument.fromJson(Map<String, dynamic> j) {
    return CorDocument(
      fileUrl: j['file_url'] as String? ?? '',
      uploadedAt: j['uploaded_at'] as String?,
    );
  }
}

Future<CorDocument> uploadEnrollmentCor(String profileId, File file, {String? fileName}) async {
  final size = await file.length();
  if (size > maxCorBytes) {
    throw Exception('Document must be 5MB or smaller');
  }
  final name = fileName ?? file.path.split(Platform.pathSeparator).last;
  final ext = name.contains('.') ? name.split('.').last : 'pdf';
  final path = '$profileId/cor.$ext';
  await Supabase.instance.client.storage.from('verification-documents').upload(
        path,
        file,
        fileOptions: const FileOptions(upsert: true),
      );
  final url = Supabase.instance.client.storage.from('verification-documents').getPublicUrl(path);
  final uploadedAt = DateTime.now().toUtc().toIso8601String();
  final existing = await Supabase.instance.client
      .from('student_documents')
      .select('id')
      .eq('profile_id', profileId)
      .eq('document_type', 'cor')
      .maybeSingle();
  if (existing != null) {
    await Supabase.instance.client
        .from('student_documents')
        .update({'file_url': url, 'uploaded_at': uploadedAt})
        .eq('id', existing['id'] as String);
  } else {
    await Supabase.instance.client.from('student_documents').insert({
      'profile_id': profileId,
      'document_type': 'cor',
      'file_url': url,
      'uploaded_at': uploadedAt,
    });
  }
  return CorDocument(fileUrl: url, uploadedAt: uploadedAt);
}
