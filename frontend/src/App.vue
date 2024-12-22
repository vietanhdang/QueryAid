<template>
    <div>
        <sql-editor
            v-model="sqlQuery"
            ref="sqlEditor"
            :theme="isDark ? 'vs-dark' : 'vs'"
            height="50vh"
            @change="handleQueryChange"
            @validate="handleValidation"
        >
            <template #default>
                <div class="loading-spinner">Loading editor...</div>
            </template>
        </sql-editor>

        <!-- Optional: Trigger from parent -->
        <!-- <button @click="runQuery">Run Query</button> -->
    </div>
</template>

<script setup>
import { ref } from 'vue';
import SqlEditor from './components/SqlEditor.vue';

const sqlQuery = ref('');
const sqlEditor = ref(null);
const isDark = ref(true);

const runQuery = () => {
    sqlEditor.value?.executeQuery();
};

const handleQueryChange = (value, event) => {
    // console.log('Query changed:', value);
};

const handleValidation = (markers) => {
    // console.log('Validation markers:', markers);
};
</script>
