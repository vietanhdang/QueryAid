const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// PostgreSQL configuration
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'postgres',
    password: '12345678',
    port: 5432
});

// Helper function to validate SQL query
const isValidQuery = (query) => {
    const dangerousKeywords = [
        'DROP',
        'DELETE',
        'TRUNCATE',
        'ALTER',
        'CREATE',
        'INSERT',
        'UPDATE',
        'GRANT',
        'REVOKE'
    ];

    const upperQuery = query.toUpperCase();
    return !dangerousKeywords.some((keyword) => upperQuery.includes(keyword));
};

// API to get schema, tables and columns
app.get('/api/sql-metadata', async (req, res) => {
    try {
        const tablesResult = await pool.query(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
        );
        const tables = tablesResult.rows.map((row) => row.table_name);

        const columns = {};
        for (const table of tables) {
            const columnsResult = await pool.query(
                `SELECT column_name, data_type, is_nullable 
                 FROM information_schema.columns 
                 WHERE table_name = $1`,
                [table]
            );
            columns[table] = columnsResult.rows.map((row) => ({
                name: row.column_name,
                type: row.data_type,
                nullable: row.is_nullable === 'YES'
            }));
        }

        res.json({ tables, columns });
    } catch (err) {
        console.error('Error fetching metadata:', err);
        res.status(500).json({
            error: 'Internal server error',
            message: err.message
        });
    }
});

// API to execute SQL queries
app.post('/api/execute-query', async (req, res) => {
    const { query } = req.body;

    if (!query) {
        return res.status(400).json({
            error: 'Bad Request',
            message: 'Query is required'
        });
    }

    // Validate query for security
    if (!isValidQuery(query)) {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'Only SELECT queries are allowed'
        });
    }

    try {
        // Set query timeout to 10 seconds
        const queryConfig = {
            text: query,
            timeout: 10000
        };

        const startTime = Date.now();
        const result = await pool.query(queryConfig);
        const executionTime = Date.now() - startTime;

        res.json({
            success: true,
            rows: result.rows,
            rowCount: result.rowCount,
            fields: result.fields.map((field) => ({
                name: field.name,
                dataType: field.dataTypeID
            })),
            executionTime,
            message: `Query executed successfully. Returned ${result.rowCount} rows.`
        });
    } catch (err) {
        console.error('Error executing query:', err);
        res.status(400).json({
            error: 'Query Error',
            message: err.message,
            position: err.position,
            detail: err.detail
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date() });
});

// Start server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
