<template>
    <div>
        <div :class="className">
            <vue-monaco-editor
                :value="modelValue"
                :language="language"
                :path="path"
                :default-value="defaultValue"
                :default-language="defaultLanguage"
                :default-path="defaultPath"
                :theme="theme"
                :line="line"
                :options="editorOptions"
                :override-services="overrideServices"
                :save-view-state="saveViewState"
                :width="width"
                :height="height"
                :class-name="className"
                @change="handleChange"
                @beforeMount="handleBeforeMount"
                @mount="handleMount"
                @validate="handleValidate"
            >
                <template #default>
                    <slot>loading...</slot>
                </template>

                <template #failure>
                    <slot name="failure">load failed</slot>
                </template>
            </vue-monaco-editor>

            <!-- Query Control Buttons -->
            <div class="flex gap-2 my-2">
                <button
                    @click="executeQuery"
                    class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
                    :disabled="isExecuting"
                >
                    {{
                        isExecuting ? 'Executing...' : 'Execute (Ctrl + Enter)'
                    }}
                </button>
                <button
                    @click="clearResults"
                    class="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
                    v-if="queryResult"
                >
                    Clear Results
                </button>
            </div>

            <!-- Query Results -->
            <div v-if="queryResult" class="mt-4 border rounded">
                <div
                    class="bg-gray-100 p-3 border-b flex justify-between items-center"
                >
                    <span>Results ({{ queryResult.rowCount }} rows)</span>
                    <span
                        >Execution time: {{ queryResult.executionTime }}ms</span
                    >
                </div>
                <div class="overflow-x-auto max-h-80">
                    <table class="min-w-full">
                        <thead>
                            <tr class="bg-gray-50">
                                <th
                                    v-for="field in queryResult.fields"
                                    :key="field.name"
                                    class="px-4 py-2 text-left text-sm font-semibold text-gray-600 border-b"
                                >
                                    {{ field.name }}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr
                                v-for="(row, index) in queryResult.rows"
                                :key="index"
                                class="border-b hover:bg-gray-50"
                            >
                                <td
                                    v-for="field in queryResult.fields"
                                    :key="field.name"
                                    class="px-4 py-2 text-sm"
                                >
                                    {{ row[field.name] }}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Error Message -->
            <div v-if="error" class="mt-4 p-4 bg-red-50 text-red-700 rounded">
                <div class="font-bold">Error:</div>
                <div>{{ error }}</div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, defineProps, defineEmits, watch } from 'vue';
import VueMonacoEditor from '@guolao/vue-monaco-editor';

// SQL Table and Column regex
const tableRegex =
    /\b(FROM|JOIN|UPDATE|INSERT\s+INTO)\s+([a-zA-Z0-9_.]+)(?:\s+AS\s+([a-zA-Z0-9_]+))?\s*(?:([a-zA-Z0-9_]+))?/gi;

// Cache for SQL metadata
const metadataCache = ref(null);
const fetchingMetadata = ref(false);

const queryResult = ref(null);
const error = ref(null);
const isExecuting = ref(false);

// Define props
const props = defineProps({
    modelValue: {
        type: String,
        default: ''
    },
    language: {
        type: String,
        default: 'sql'
    },
    path: {
        type: String,
        default: 'sql-file.sql'
    },
    defaultValue: {
        type: String,
        default: 'SELECT * FROM '
    },
    defaultLanguage: {
        type: String,
        default: 'sql'
    },
    defaultPath: {
        type: String,
        default: 'sql-file.sql'
    },
    theme: {
        type: String,
        default: 'vs-dark'
    },
    line: {
        type: Number,
        default: 1
    },
    options: {
        type: Object,
        default: () => ({})
    },
    overrideServices: {
        type: Object,
        default: () => ({})
    },
    saveViewState: {
        type: Boolean,
        default: true
    },
    width: {
        type: [String, Number],
        default: '100%'
    },
    height: {
        type: [String, Number],
        default: '400px'
    },
    className: {
        type: String,
        default: ''
    },
    skip: {
        type: Number,
        default: 0
    },
    limit: {
        type: Number,
        default: 100
    }
});

// Define emits
const emit = defineEmits([
    'update:modelValue',
    'beforeMount',
    'mount',
    'change',
    'validate'
]);

const editor = ref(null);
const monacoInstance = ref(null);

const editorOptions = {
    automaticLayout: true,
    tabSize: 2,
    minimap: {
        enabled: false
    },
    ...props.options
};

// Function to fetch metadata with caching
const getMetadata = async () => {
    // Return cached data if available
    if (metadataCache.value) {
        return metadataCache.value;
    }

    // If already fetching, wait for it to complete
    if (fetchingMetadata.value) {
        await new Promise((resolve) => {
            const checkCache = setInterval(() => {
                if (metadataCache.value) {
                    clearInterval(checkCache);
                    resolve();
                }
            }, 100);
        });
        return metadataCache.value;
    }

    // Fetch new data
    try {
        fetchingMetadata.value = true;
        const response = await fetch('http://localhost:3000/api/sql-metadata');
        const metadata = await response.json();
        metadataCache.value = metadata;
        return metadata;
    } catch (error) {
        console.error('Error fetching SQL metadata:', error);
        return { tables: [], columns: {} };
    } finally {
        fetchingMetadata.value = false;
    }
};

const executeQuery = async () => {
    error.value = null;
    isExecuting.value = true;

    try {
        const response = await fetch(
            'http://localhost:3000/api/execute-query',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    query: props.modelValue,
                    skip: props.skip,
                    limit: props.limit
                })
            }
        );

        const result = await response.json();

        if (result.error) {
            error.value = result.message || 'Query execution failed';
        } else {
            queryResult.value = result;
        }
    } catch (err) {
        error.value = err.message || 'Failed to execute query';
    } finally {
        isExecuting.value = false;
    }
};

const clearResults = () => {
    queryResult.value = null;
    error.value = null;
};

// Add keyboard shortcut for query execution
const setupKeyboardShortcuts = (editor) => {
    editor.addCommand(
        monacoInstance.value.KeyMod.CtrlCmd |
            monacoInstance.value.KeyCode.Enter,
        executeQuery
    );
};

// getTablesAndAliases function
const getTablesAndAliases = (query) => {
    const tables = [];
    const aliases = {};

    let match;
    while ((match = tableRegex.exec(query))) {
        const [, , table, alias] = match;
        if (!tables.includes(table)) {
            tables.push(table); // Add table to the list if not already present
        }
        if (alias) {
            aliases[alias] = table; // Store alias for later use
        }
    }

    return { tables, aliases };
};

const handleBeforeMount = (monaco) => {
    monacoInstance.value = monaco;

    // Register SQL language provider
    monaco.languages.registerCompletionItemProvider('sql', {
        provideCompletionItems: async (model, position) => {
            const metadata = await getMetadata();
            const suggestions = [];

            // SQL Keywords
            // const keywords = [
            //     'SELECT',
            //     'FROM',
            //     'WHERE',
            //     'JOIN',
            //     'LEFT',
            //     'RIGHT',
            //     'INNER',
            //     'GROUP BY',
            //     'ORDER BY',
            //     'HAVING',
            //     'LIMIT',
            //     'OFFSET',
            //     'AS',
            //     'AND',
            //     'OR',
            //     'NOT',
            //     'IN',
            //     'BETWEEN',
            //     'LIKE',
            //     'IS NULL',
            //     'IS NOT NULL',
            //     'ASC',
            //     'DESC'
            // ];

            // keywords.forEach((keyword) => {
            //     suggestions.push({
            //         label: keyword,
            //         kind: monaco.languages.CompletionItemKind.Keyword,
            //         insertText: keyword,
            //         detail: 'SQL Keyword'
            //     });
            // });

            // Tables and Columns
            // metadata.tables?.forEach((table) => {
            //     suggestions.push({
            //         label: table,
            //         kind: monaco.languages.CompletionItemKind.Class,
            //         insertText: table,
            //         detail: 'Table',
            //         documentation: `Table: ${table}`
            //     });

            //     metadata.columns[table]?.forEach((column) => {
            //         const columnName =
            //             typeof column === 'string' ? column : column.name;
            //         const columnType =
            //             typeof column === 'string' ? null : column.type;

            //         suggestions.push({
            //             label: columnName,
            //             kind: monaco.languages.CompletionItemKind.Field,
            //             insertText: columnName,
            //             detail: `Column from ${table}`,
            //             documentation: columnType
            //                 ? `Column: ${columnName}\nType: ${columnType}\nTable: ${table}`
            //                 : `Column: ${columnName} (${table})`
            //         });
            //     });
            // });

            // Get text before the current position
            const textBeforePosition = model.getValueInRange({
                startLineNumber: 1,
                startColumn: 1,
                endLineNumber: position.lineNumber,
                endColumn: position.column
            });

            // Get tables and aliases from the query
            const { tables, aliases } = getTablesAndAliases(textBeforePosition);

            // Suggest tables that are used in FROM, JOIN, UPDATE, or INSERT
            metadata.tables?.forEach((table) => {
                if (tables.includes(table)) {
                    // Suggest columns for the table if it has columns
                    metadata.columns[table]?.forEach((column) => {
                        const columnName =
                            typeof column === 'string' ? column : column.name;
                        const columnType =
                            typeof column === 'string' ? null : column.type;

                        suggestions.push({
                            label: columnName,
                            kind: monaco.languages.CompletionItemKind.Field,
                            insertText: columnName,
                            detail: `Column from ${table}`,
                            documentation: columnType
                                ? `Column: ${columnName}\nType: ${columnType}\nTable: ${table}`
                                : `Column: ${columnName} (${table})`
                        });
                    });
                }
            });

            // Suggest tables that are used in FROM, JOIN, UPDATE, or INSERT (no columns yet)
            metadata.tables?.forEach((table) => {
                if (!tables.includes(table)) {
                    suggestions.push({
                        label: table,
                        kind: monaco.languages.CompletionItemKind.Class,
                        insertText: table,
                        detail: 'Table',
                        documentation: `Table: ${table}`
                    });
                }
            });

            // Suggest aliases if the table has been aliased
            Object.keys(aliases).forEach((alias) => {
                suggestions.push({
                    label: alias,
                    kind: monaco.languages.CompletionItemKind.Variable,
                    insertText: alias,
                    detail: 'Alias for table',
                    documentation: `Alias for table: ${aliases[alias]}`
                });
            });

            return { suggestions };
        },
        triggerCharacters: [' ', '.', ',']
    });

    emit('beforeMount', monaco);
};

const handleMount = (editorInstance, monaco) => {
    editor.value = editorInstance;
    setupKeyboardShortcuts(editorInstance);
    emit('mount', editorInstance, monaco);
};

const handleChange = (value, event) => {
    emit('update:modelValue', value);
    emit('change', value, event);
};

const handleValidate = (markers) => {
    emit('validate', markers);
};

defineExpose({
    executeQuery,
    clearResults
});

// Watch for external line number changes
watch(
    () => props.line,
    (newLine) => {
        if (editor.value && newLine > 0) {
            editor.value.revealLineInCenter(newLine);
        }
    }
);
</script>
<style scoped>
.results-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 1rem;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.results-table th {
    background-color: #4f46e5; /* Màu xanh chủ đạo */
    color: #ffffff;
    font-weight: bold;
    text-align: left;
    padding: 12px;
    font-size: 14px;
    text-transform: uppercase;
}

.results-table td {
    padding: 10px 12px;
    font-size: 14px;
    color: #333333;
    border-bottom: 1px solid #e5e7eb;
}

.results-table tbody tr:nth-child(odd) {
    background-color: #f9fafb; /* Màu nền cho dòng lẻ */
}

.results-table tbody tr:nth-child(even) {
    background-color: #ffffff; /* Màu nền cho dòng chẵn */
}

.results-table tbody tr:hover {
    background-color: #e0e7ff; /* Màu nền khi hover */
    transition: background-color 0.3s ease;
}
</style>
