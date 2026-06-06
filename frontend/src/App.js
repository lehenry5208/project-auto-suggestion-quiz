import React, { useState, useEffect } from 'react';
import './App.css';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import ProblemPage from './pages/ProblemPage';
import CreateProblemPage from './pages/CreateProblemPage';
import ReviewPage from './pages/ReviewPage';
import { getTeacherProblems, deleteProblem, createProblem } from './api';

function buildProblemDataFromAutofill(data) {
    const languages = Array.isArray(data.languages) && data.languages.length > 0
        ? data.languages
        : ['python'];

    const sections = Array.isArray(data.sections)
        ? [...data.sections]
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .map((s, i) => {
                const code = typeof s.code === 'object' && s.code ? { ...s.code } : {};
                languages.forEach(l => { if (!code[l]) code[l] = ''; });
                const suggestions = Array.isArray(s.suggestions) && s.suggestions.length > 0
                    ? s.suggestions.map(sg => ({
                        type: sg.type || 'ai',
                        isCorrect: sg.isCorrect !== undefined ? sg.isCorrect : true,
                        content: (sg.type === 'manual' ? sg.content : '') || '',
                    }))
                    : [{ type: 'ai', isCorrect: true, content: '' }];
                return { order: i + 1, label: (s.label || '').trim(), code, suggestions };
            })
        : [];

    const boilerplate = data.boilerplate && typeof data.boilerplate === 'object' && Object.keys(data.boilerplate).length > 0
        ? data.boilerplate
        : Object.fromEntries(languages.map(lang => [
            lang,
            sections.map(s => (s.code && s.code[lang]) || '').join('\n'),
        ]));

    return {
        title: (data.title || '').trim(),
        description: (data.description || '').trim(),
        languages,
        boilerplate,
        sections,
        testCases: Array.isArray(data.testCases)
            ? data.testCases.map(tc => ({
                input: tc.input || '',
                expected: tc.expected || '',
                explanation: tc.explanation || '',
            }))
            : [],
        timeLimitSeconds: data.timeLimitMinutes ? Number(data.timeLimitMinutes) * 60 : null,
        maxSubmissions: data.maxSubmissions != null ? Number(data.maxSubmissions) : null,
        allowCopyPaste: data.allowCopyPaste !== undefined ? data.allowCopyPaste : true,
        trackTabSwitching: data.trackTabSwitching !== undefined ? data.trackTabSwitching : false,
    };
}

function restoreSession() {
    try {
        const token = localStorage.getItem('teacher_token');
        if (!token) return null;
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.exp * 1000 < Date.now()) {
            localStorage.removeItem('teacher_token');
            return null;
        }
        return { token, email: payload.email, role: payload.role, id: payload.user_id };
    } catch {
        return null;
    }
}

function App() {
    const restoredUser = restoreSession();

    const [currentPage, setCurrentPage] = useState(restoredUser ? 'dashboard' : 'login');
    const [selectedProblem, setSelectedProblem] = useState(null);
    const [studentName, setStudentName] = useState(null);
    const [user, setUser] = useState(restoredUser);
    const [problems, setProblems] = useState([]);
    const [problemsLoading, setProblemsLoading] = useState(false);
    const [problemsError, setProblemsError] = useState('');
    const [reviewTarget, setReviewTarget] = useState(null);
    const [autofillResult, setAutofillResult] = useState(null);
    const [autofillGenerating, setAutofillGenerating] = useState(false);
    const [autofillError, setAutofillError] = useState('');

    const loadProblems = (token) => {
        setProblemsLoading(true);
        setProblemsError('');
        getTeacherProblems(token)
            .then((data) => { setProblems(data); setProblemsLoading(false); })
            .catch((err) => { setProblemsError(err.message); setProblemsLoading(false); });
    };

    useEffect(() => {
        if (user?.token && currentPage === 'dashboard') {
            loadProblems(user.token);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, currentPage]);

    const handleLogin = (userData) => {
        setUser(userData);
        if (userData.token) {
            localStorage.setItem('teacher_token', userData.token);
        }
        if (userData.role === 'student') {
            setSelectedProblem(userData.problem);
            setStudentName(userData.studentName);
            setCurrentPage('problem');
        } else {
            setCurrentPage('dashboard');
        }
    };

    const handleBackToDashboard = () => {
        if (!user?.token) {
            // Student — no teacher session, return to login
            setSelectedProblem(null);
            setStudentName(null);
            setCurrentPage('login');
        } else {
            setCurrentPage('dashboard');
            setSelectedProblem(null);
            loadProblems(user.token);
        }
    };

    const handleCreateProblem = () => {
        setCurrentPage('createProblem');
    };

    const handleProblemCreated = (newProblem) => {
        setProblems((prev) => [newProblem, ...prev]);
        setCurrentPage('dashboard');
    };

    const handleAutofillReady = async (data) => {
        if (!data || data.error) {
            setAutofillGenerating(false);
            setAutofillError(data?.error || 'AI generation failed. Please try again.');
            return;
        }
        try {
            const payload = buildProblemDataFromAutofill(data);
            const created = await createProblem(payload, localStorage.getItem('teacher_token'));
            setProblems((prev) => [created, ...prev]);
        } catch (err) {
            setAutofillError(err.message || 'Failed to create the generated problem.');
        } finally {
            setAutofillGenerating(false);
        }
    };

    const handleDeleteProblem = async (problemId) => {
        try {
            await deleteProblem(problemId, user.token);
            setProblems((prev) => prev.filter((p) => p.id !== problemId));
        } catch (err) {
            console.error('Failed to delete problem:', err);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('teacher_token');
        setUser(null);
        setSelectedProblem(null);
        setStudentName(null);
        setProblems([]);
        setCurrentPage('login');
    };

    if (currentPage === 'login') {
        return <LoginPage onLogin={handleLogin} />;
    }

    if (reviewTarget) {
        return (
            <ReviewPage
                submission={reviewTarget.submission}
                allSubmissions={reviewTarget.allSubmissions}
                problem={reviewTarget.problem}
                onBack={() => setReviewTarget(null)}
                token={user?.token}
            />
        );
    }

    if (currentPage === 'problem' && selectedProblem) {
        return (
            <ProblemPage
                problem={selectedProblem}
                studentName={studentName}
                onBack={handleBackToDashboard}
            />
        );
    }

    if (currentPage === 'createProblem') {
        return (
            <CreateProblemPage
                onBack={handleBackToDashboard}
                onCreated={handleProblemCreated}
                autofillResult={autofillResult}
                onAutofillConsumed={() => setAutofillResult(null)}
                onAutofillReady={handleAutofillReady}
                onAutofillStart={() => { setAutofillError(''); setAutofillGenerating(true); }}
            />
        );
    }

    return (
        <Dashboard
            problems={problems}
            problemsLoading={problemsLoading}
            problemsError={problemsError}
            onCreateProblem={handleCreateProblem}
            onDeleteProblem={handleDeleteProblem}
            onProblemsUpdate={setProblems}
            onRefresh={() => loadProblems(user.token)}
            onReview={(submission, problem, allSubmissions) => setReviewTarget({ submission, problem, allSubmissions })}
            onLogout={handleLogout}
            user={user}
            autofillPending={autofillResult !== null}
            autofillGenerating={autofillGenerating}
            autofillError={autofillError}
            onDismissAutofillError={() => setAutofillError('')}
        />
    );
}

export default App;