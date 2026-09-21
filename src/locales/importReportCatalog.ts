import type { SupportedAppLocale } from '@/services/general/localeRegistry';

export type ImportReportLocaleContent = Readonly<{
  humanSummaryTemplate: string;
  readmeMarkdown: string;
  v2HumanSummaryTemplate: string;
  v2ReadingGuide: string;
  v2ReadmeMarkdown: string;
}>;

export const IMPORT_REPORT_CONTENT_BY_APP_LOCALE = {
  'zh-CN': {
    v2HumanSummaryTemplate: '导入结果：{outcome}。总记录 {total_entries} 条，新增 {imported_count} 条，因数据类型、ID 和版本相同而跳过 {existing_count} 条，未导入 {not_imported_count} 条，校验问题 {validation_issue_count} 条。',
    v2ReadingGuide: '先查看 report.outcome 和 report.summary。issues_by_file 按文件归类 report.validation_issues 中的样本；issues_by_file_truncated 为 true 时还有未展示的问题。report.skipped_records 和 report.roots 也可能只含样本，请查看各自的 truncated 标记。',
    v2ReadmeMarkdown: `# 如何查看 TIDAS 导入报告

\`report\` 保留任务生成的原始结果。\`report.outcome\` 表示导入结果：\`success\` 为全部记录已导入或复用，\`partial\` 为部分导入，\`none\` 为没有根分组成功，\`interrupted\` 为执行中断。

\`report.summary\` 分别统计新增、已存在而跳过及未导入记录。已存在指数据类型、ID、版本相同，不代表数据冲突。\`issues_by_file\` 仅整理 \`report.validation_issues\` 中提供的问题样本；若 \`issues_by_file_truncated\` 为 true，不能将其视为全部问题。\`report.validation_issues_truncated\`、\`report.roots_truncated\` 和 \`report.skipped_records_truncated\` 保留原始截断信息。

每条校验问题可通过文件路径、字段位置、严重级别和原始说明定位；\`ignored_for_import\` 表示该问题被导入结果过滤规则忽略，并未从原始证据中删除。
`,
    humanSummaryTemplate: '导入结果：{code}。总记录 {total_entries} 条，开放数据跳过 {filtered_open_data_count} 条，用户数据冲突 {user_conflict_count} 条，成功导入 {imported_count} 条，校验问题 {validation_issue_count} 条。',
    readmeMarkdown: `# 如何查看这个导入报告

这个文件中的 \`report\` 是系统导入接口最终返回的完整结果，里面既可能有“用户数据冲突”，也可能有“数据校验失败”的详细信息。

## 先看什么

1. 先看 \`report.code\`：
   - \`VALIDATION_FAILED\`：数据包内容本身有问题，系统已阻止导入。
   - 其他失败码且 \`user_conflicts\` 不为空：目标环境里已有冲突的用户数据。
2. 再看 \`report.summary\`：
   - \`total_entries\`：数据包里一共有多少条记录。
   - \`filtered_open_data_count\`：被跳过的开放数据数量。
   - \`user_conflict_count\`：与当前用户数据冲突的记录数量。
   - \`validation_issue_count\`：校验问题数量。

## 如果是校验失败，去哪里找问题

看 \`report.validation_issues\` 数组。每一条问题里最重要的是：

- \`file_path\`：问题出在哪个文件。
- \`location\`：问题在文件里的哪个字段路径。
- \`message\`：系统直接告诉你的错误说明。
- \`issue_code\`：问题类型。
- \`severity\`：严重级别，通常 \`error\` 需要先修复，\`warning\` 建议检查。
- \`context\`：补充上下文，给开发或高级用户排查用。

如果你看不懂 \`location\`，最简单的方法是：

1. 先解压原始 ZIP 数据包。
2. 打开 \`file_path\` 对应的文件。
3. 在文件里按 \`location\` 提示逐层查找字段。
4. 对照 \`message\` 修改数据后重新打包导入。

## 如果是用户数据冲突，去哪里找问题

看 \`report.user_conflicts\` 数组。每一条冲突记录里最重要的是：

- \`table\`：冲突的数据表类型。
- \`id\`：冲突记录的主 ID。
- \`version\`：冲突记录的版本。
- \`state_code\`：当前系统里这条记录的状态。
- \`user_id\`：如果有值，表示这条冲突数据关联到哪个用户。

常见处理方法：

1. 先确认目标系统中是否已经有同一条用户数据。
2. 如果已有数据且应该保留，修改导入包中的 \`id\` / \`version\` 或删除重复记录。
3. 如果目标系统中的旧数据不再需要，先在系统中处理旧数据，再重新导入。

## 被跳过的开放数据是什么意思

\`report.filtered_open_data\` 里的记录表示：这些数据属于开放数据，导入时被系统自动跳过，没有写入你的用户数据空间。

这通常不是错误，除非你本来就预期它们应该作为用户数据导入。
`,
  },
  'en-US': {
    v2HumanSummaryTemplate: 'Import outcome: {outcome}. Total records: {total_entries}; inserted: {imported_count}; skipped because type, ID and version already exist: {existing_count}; not imported: {not_imported_count}; validation issues: {validation_issue_count}.',
    v2ReadingGuide: 'Start with report.outcome and report.summary. issues_by_file groups only the samples in report.validation_issues. If issues_by_file_truncated is true, more issues exist. report.skipped_records and report.roots may also be samples; inspect their truncated flags.',
    v2ReadmeMarkdown: `# How to read this TIDAS import report

\`report\` preserves the original task result. \`report.outcome\` is \`success\` when every record was inserted or reused, \`partial\` when only some records were imported, \`none\` when no root group succeeded, and \`interrupted\` when execution stopped.

\`report.summary\` separates inserted records, existing records skipped by exact type/ID/version, and records not imported. An existing record is a skip, not a conflict. \`issues_by_file\` groups only the issue samples provided in \`report.validation_issues\`; when \`issues_by_file_truncated\` is true, it is not a complete issue list. The original \`report.validation_issues_truncated\`, \`report.roots_truncated\`, and \`report.skipped_records_truncated\` flags remain available.

Use an issue's file path, field location, severity and original message to find the problem. \`ignored_for_import\` means the import-result filter ignored that issue; the original evidence remains in the report.
`,
    humanSummaryTemplate: 'Import result: {code}. Total records: {total_entries}, skipped open-data records: {filtered_open_data_count}, user conflicts: {user_conflict_count}, imported: {imported_count}, validation issues: {validation_issue_count}.',
    readmeMarkdown: `# How to read this import report

The \`report\` object in this file is the final result returned by the import API. It may contain detailed validation failures, user-data conflicts, or skipped open-data records.

## What to check first

1. Start with \`report.code\`:
   - \`VALIDATION_FAILED\`: the package content itself is invalid, so the import was blocked.
   - Other failure codes with non-empty \`user_conflicts\`: the target environment already has conflicting user-owned data.
2. Then review \`report.summary\`:
   - \`total_entries\`: total records found in the package.
   - \`filtered_open_data_count\`: open-data records skipped during import.
   - \`user_conflict_count\`: records conflicting with existing user data.
   - \`validation_issue_count\`: total validation issues found.

## If validation failed, where is the problem

Check the \`report.validation_issues\` array. The most important fields are:

- \`file_path\`: which file contains the problem.
- \`location\`: which field path inside that file is problematic.
- \`message\`: the direct explanation from the validator.
- \`issue_code\`: the issue type.
- \`severity\`: the severity level. Usually \`error\` must be fixed first, while \`warning\` should still be reviewed.
- \`context\`: extra debugging context for developers or advanced users.

If \`location\` is hard to read, use this simple workflow:

1. Extract the original ZIP package.
2. Open the file shown in \`file_path\`.
3. Follow the field path from \`location\`.
4. Fix the data according to \`message\`, then rebuild and re-import the package.

## If there are user-data conflicts, where is the problem

Check the \`report.user_conflicts\` array. The most important fields are:

- \`table\`: which table or dataset type conflicts.
- \`id\`: the conflicting record ID.
- \`version\`: the conflicting record version.
- \`state_code\`: the current state of that existing record in the system.
- \`user_id\`: when present, which user owns or is linked to that conflicting record.

Common ways to resolve conflicts:

1. Confirm whether the target system already contains the same user-owned data.
2. If the existing record should stay, update the package \`id\` / \`version\` or remove the duplicate record from the package.
3. If the old record in the target system is no longer needed, handle that old data first and then import again.

## What skipped open-data records mean

Records in \`report.filtered_open_data\` were recognized as open data and skipped automatically. They were not imported into your user data space.

This is usually expected behavior unless you intended those records to be imported as user-owned data.
`,
  },
  'de-DE': {
    v2HumanSummaryTemplate: 'Importergebnis: {outcome}. Datensätze insgesamt: {total_entries}; neu eingefügt: {imported_count}; wegen gleicher Art, ID und Version übersprungen: {existing_count}; nicht importiert: {not_imported_count}; Validierungsprobleme: {validation_issue_count}.',
    v2ReadingGuide: 'Prüfen Sie zuerst report.outcome und report.summary. issues_by_file gruppiert nur die Beispiele aus report.validation_issues. Bei issues_by_file_truncated=true gibt es weitere Probleme. Auch report.skipped_records und report.roots können gekürzt sein; prüfen Sie die truncated-Markierungen.',
    v2ReadmeMarkdown: `# So lesen Sie diesen TIDAS-Importbericht

\`report\` enthält das ursprüngliche Aufgabenergebnis. \`report.outcome\` unterscheidet \`success\` (alle Datensätze eingefügt oder wiederverwendet), \`partial\` (teilweise importiert), \`none\` (keine erfolgreiche Wurzelgruppe) und \`interrupted\` (Ausführung unterbrochen).

\`report.summary\` trennt neu eingefügte, anhand von Art/ID/Version übersprungene und nicht importierte Datensätze. Ein bereits vorhandener Datensatz ist kein Konflikt. \`issues_by_file\` gruppiert nur die Beispiele aus \`report.validation_issues\`; \`issues_by_file_truncated=true\` zeigt weitere Probleme an. Die ursprünglichen Kürzungsmarkierungen bleiben in \`report\` erhalten.

Dateipfad, Feldposition, Schweregrad und Originalmeldung helfen bei der Fehlersuche. \`ignored_for_import\` bezeichnet ein für die Importentscheidung ignoriertes Problem; der ursprüngliche Nachweis bleibt erhalten.
`,
    humanSummaryTemplate: 'Importergebnis: {code}. Datensätze insgesamt: {total_entries}, übersprungene Open-Data-Datensätze: {filtered_open_data_count}, Konflikte mit benutzereigenen Daten: {user_conflict_count}, importiert: {imported_count}, Validierungsprobleme: {validation_issue_count}.',
    readmeMarkdown: `# So lesen Sie diesen Importbericht

Das Objekt \`report\` in dieser Datei ist das vollständige Ergebnis der Importschnittstelle. Es kann Details zu fehlgeschlagenen Validierungen, Konflikten mit benutzereigenen Daten oder übersprungenen Open-Data-Datensätzen enthalten.

## Was Sie zuerst prüfen sollten

1. Beginnen Sie mit \`report.code\`:
   - \`VALIDATION_FAILED\`: Der Inhalt des Datenpakets ist ungültig. Der Import wurde deshalb blockiert.
   - Andere Fehlercodes bei einem nicht leeren Feld \`user_conflicts\`: In der Zielumgebung liegen bereits benutzereigene Daten vor, die mit dem Paket in Konflikt stehen.
2. Prüfen Sie anschließend \`report.summary\`:
   - \`total_entries\`: Gesamtzahl der im Paket gefundenen Datensätze.
   - \`filtered_open_data_count\`: Anzahl der beim Import übersprungenen Open-Data-Datensätze.
   - \`user_conflict_count\`: Anzahl der Datensätze, die mit vorhandenen benutzereigenen Daten in Konflikt stehen.
   - \`validation_issue_count\`: Gesamtzahl der gefundenen Validierungsprobleme.

## Wo liegt das Problem, wenn die Validierung fehlgeschlagen ist?

Prüfen Sie das Array \`report.validation_issues\`. Besonders wichtig sind folgende Felder:

- \`file_path\`: Datei, in der das Problem aufgetreten ist.
- \`location\`: Betroffener Feldpfad innerhalb dieser Datei.
- \`message\`: Direkte Erläuterung des Validators.
- \`issue_code\`: Art des Problems.
- \`severity\`: Schweregrad. Probleme mit \`error\` müssen in der Regel zuerst behoben werden; Probleme mit \`warning\` sollten ebenfalls geprüft werden.
- \`context\`: Zusätzlicher Diagnosekontext für Entwicklung oder fortgeschrittene Analyse.

Wenn \`location\` schwer zu lesen ist, gehen Sie wie folgt vor:

1. Entpacken Sie das ursprüngliche ZIP-Datenpaket.
2. Öffnen Sie die unter \`file_path\` angegebene Datei.
3. Folgen Sie dem Feldpfad aus \`location\`.
4. Korrigieren Sie die Daten entsprechend \`message\`, erstellen Sie das Paket neu und importieren Sie es erneut.

## Wo liegt das Problem bei Konflikten mit benutzereigenen Daten?

Prüfen Sie das Array \`report.user_conflicts\`. Besonders wichtig sind folgende Felder:

- \`table\`: Tabelle oder Datensatztyp, bei dem der Konflikt aufgetreten ist.
- \`id\`: ID des betroffenen Datensatzes.
- \`version\`: Version des betroffenen Datensatzes.
- \`state_code\`: Aktueller Status des vorhandenen Datensatzes im System.
- \`user_id\`: Sofern vorhanden, die Person, der der betroffene Datensatz gehört oder zugeordnet ist.

Übliche Vorgehensweisen zur Konfliktbehebung:

1. Prüfen Sie, ob das Zielsystem dieselben benutzereigenen Daten bereits enthält.
2. Wenn der vorhandene Datensatz erhalten bleiben soll, ändern Sie \`id\` / \`version\` im Paket oder entfernen Sie das Duplikat aus dem Paket.
3. Wenn der alte Datensatz im Zielsystem nicht mehr benötigt wird, bearbeiten Sie ihn dort zuerst und starten Sie den Import anschließend erneut.

## Was bedeuten übersprungene Open-Data-Datensätze?

Datensätze in \`report.filtered_open_data\` wurden als offene Daten erkannt und automatisch übersprungen. Sie wurden nicht in Ihren Bereich für benutzereigene Daten importiert.

Dieses Verhalten ist normalerweise beabsichtigt. Prüfen Sie es nur dann genauer, wenn diese Datensätze als benutzereigene Daten importiert werden sollten.
`,
  },
  'fr-FR': {
    v2HumanSummaryTemplate: "Résultat de l'importation : {outcome}. Enregistrements au total : {total_entries} ; ajoutés : {imported_count} ; ignorés car le type, l'ID et la version existent déjà : {existing_count} ; non importés : {not_imported_count} ; problèmes de validation : {validation_issue_count}.",
    v2ReadingGuide: "Commencez par report.outcome et report.summary. issues_by_file regroupe seulement les exemples de report.validation_issues. Si issues_by_file_truncated vaut true, d'autres problèmes existent. report.skipped_records et report.roots peuvent aussi être limités : vérifiez leurs indicateurs truncated.",
    v2ReadmeMarkdown: `# Comment lire ce rapport d'importation TIDAS

\`report\` conserve le résultat original de la tâche. \`report.outcome\` indique \`success\` si tous les enregistrements sont ajoutés ou réutilisés, \`partial\` pour une importation partielle, \`none\` si aucun groupe racine n'a réussi et \`interrupted\` si l'exécution a été interrompue.

\`report.summary\` distingue les ajouts, les enregistrements déjà présents ignorés selon leur type/ID/version et les enregistrements non importés. Un enregistrement existant n'est pas un conflit. \`issues_by_file\` regroupe seulement les exemples de \`report.validation_issues\` ; \`issues_by_file_truncated=true\` signale des problèmes supplémentaires. Les indicateurs de limitation originaux restent dans \`report\`.

Le chemin du fichier, l'emplacement du champ, la gravité et le message d'origine aident à trouver le problème. \`ignored_for_import\` indique qu'un problème a été ignoré pour la décision d'importation, sans supprimer la preuve d'origine.
`,
    humanSummaryTemplate: "Résultat de l'importation : {code}. Nombre total d'enregistrements : {total_entries}, enregistrements de données ouvertes ignorés : {filtered_open_data_count}, conflits avec les données utilisateur : {user_conflict_count}, importés : {imported_count}, problèmes de validation : {validation_issue_count}.",
    readmeMarkdown: `# Comment lire ce rapport d'importation

L'objet \`report\` de ce fichier est le résultat complet renvoyé par l'API d'importation. Il peut contenir le détail des échecs de validation, des conflits avec les données utilisateur ou des enregistrements de données ouvertes ignorés.

## Éléments à vérifier en priorité

1. Commencez par \`report.code\` :
   - \`VALIDATION_FAILED\` : le contenu du paquet n'est pas valide ; l'importation a donc été bloquée.
   - Autres codes d'échec avec un champ \`user_conflicts\` non vide : l'environnement cible contient déjà des données utilisateur qui entrent en conflit avec le paquet.
2. Examinez ensuite \`report.summary\` :
   - \`total_entries\` : nombre total d'enregistrements trouvés dans le paquet.
   - \`filtered_open_data_count\` : nombre d'enregistrements de données ouvertes ignorés pendant l'importation.
   - \`user_conflict_count\` : nombre d'enregistrements en conflit avec des données utilisateur existantes.
   - \`validation_issue_count\` : nombre total de problèmes de validation détectés.

## Où trouver le problème en cas d'échec de la validation

Consultez le tableau \`report.validation_issues\`. Les champs les plus importants sont :

- \`file_path\` : fichier contenant le problème.
- \`location\` : chemin du champ concerné dans ce fichier.
- \`message\` : explication directe fournie par le validateur.
- \`issue_code\` : type de problème.
- \`severity\` : niveau de gravité. En règle générale, un problème \`error\` doit être corrigé en priorité, tandis qu'un problème \`warning\` doit également être examiné.
- \`context\` : contexte de diagnostic supplémentaire destiné aux développeurs ou aux utilisateurs expérimentés.

Si \`location\` est difficile à interpréter, procédez comme suit :

1. Décompressez le paquet ZIP d'origine.
2. Ouvrez le fichier indiqué par \`file_path\`.
3. Suivez le chemin de champ fourni dans \`location\`.
4. Corrigez les données conformément à \`message\`, puis reconstituez et réimportez le paquet.

## Où trouver le problème en cas de conflit avec les données utilisateur

Consultez le tableau \`report.user_conflicts\`. Les champs les plus importants sont :

- \`table\` : table ou type de jeu de données concerné par le conflit.
- \`id\` : ID de l'enregistrement en conflit.
- \`version\` : version de l'enregistrement en conflit.
- \`state_code\` : état actuel de l'enregistrement existant dans le système.
- \`user_id\` : lorsqu'il est présent, utilisateur propriétaire de l'enregistrement en conflit ou associé à celui-ci.

Méthodes courantes de résolution des conflits :

1. Vérifiez si le système cible contient déjà les mêmes données utilisateur.
2. Si l'enregistrement existant doit être conservé, modifiez \`id\` / \`version\` dans le paquet ou supprimez l'enregistrement en double du paquet.
3. Si l'ancien enregistrement du système cible n'est plus nécessaire, traitez d'abord ces anciennes données, puis relancez l'importation.

## Signification des enregistrements de données ouvertes ignorés

Les enregistrements de \`report.filtered_open_data\` ont été reconnus comme des données ouvertes et automatiquement ignorés. Ils n'ont pas été importés dans votre espace de données utilisateur.

Ce comportement est généralement normal, sauf si vous souhaitiez importer ces enregistrements comme données utilisateur.
`,
  },
} as const satisfies Record<SupportedAppLocale, ImportReportLocaleContent>;
