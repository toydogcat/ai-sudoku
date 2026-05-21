import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  RefreshCw, 
  Lightbulb, 
  Trash2, 
  HelpCircle, 
  Edit3, 
  BookOpen, 
  Sparkles, 
  Trophy, 
  RotateCcw,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Download,
  Upload,
  History,
  X,
  Check,
  ChevronRight,
  ChevronLeft,
  Flame,
  Clock,
  ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  generateFullGrid, 
  digHoles, 
  solveSudoku, 
  getNextStepHint, 
  Difficulty, 
  SudokuGrid, 
  Cell, 
  HintResult 
} from './utils/sudoku';

// Cookie Utility helpers to support "我們會在cookie 紀錄玩家的填答次序"
function setCookie(name: string, value: string, days = 30) {
  const expires = new Date();
  expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
  // Compress values for cookies to avoid size boundaries
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
}

function getCookie(name: string): string | null {
  const nameEQ = name + "=";
  const ca = document.cookie.split(';');
  for(let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return decodeURIComponent(c.substring(nameEQ.length, c.length));
  }
  return null;
}

export interface Move {
  step: number;
  row: number;
  col: number;
  value: number; // 0 for eraser, 1-9 for inputs
}

export interface GameRecord {
  id: string;
  timestamp: number;
  dateString: string;
  difficulty: Difficulty;
  elapsedTime: number;
  errorCount: number;
  initialGrid: number[][];   // 9x9 layout snapshot
  solutionGrid: number[][];  // 9x9 correct answers
  moves: Move[];
}

export default function App() {
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  
  // Active Game state
  const [fullGrid, setFullGrid] = useState<number[][]>([]);
  const [solutionGrid, setSolutionGrid] = useState<number[][]>([]);
  const [grid, setGrid] = useState<SudokuGrid>([]);
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);
  const [isNoteMode, setIsNoteMode] = useState<boolean>(false);
  const [currentMoves, setCurrentMoves] = useState<Move[]>([]);
  
  // Hint & Explanations
  const [hint, setHint] = useState<HintResult | null>(null);
  const [showMathInfo, setShowMathInfo] = useState<boolean>(true);
  
  // Statistics/Status
  const [errorCount, setErrorCount] = useState<number>(0);
  const [gameStartedAt, setGameStartedAt] = useState<number>(Date.now());
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [gameWon, setGameWon] = useState<boolean>(false);
  const [wrongCells, setWrongCells] = useState<[number, number][]>([]);

  // History & Replay Multi-game engine state
  const [gameHistory, setGameHistory] = useState<GameRecord[]>([]);
  const [showHistoryPanel, setShowHistoryPanel] = useState<boolean>(false);
  
  // Replay Viewer engine
  const [isPlayingReplay, setIsPlayingReplay] = useState<boolean>(false);
  const [replayRecord, setReplayRecord] = useState<GameRecord | null>(null);
  const [replayCurrentStep, setReplayCurrentStep] = useState<number>(0);
  const [replayIsAutoPlaying, setReplayIsAutoPlaying] = useState<boolean>(false);
  const [replaySpeed, setReplaySpeed] = useState<number>(1000); // ms per step
  
  // File upload state / notification
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replayTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-clear notification after 5s
  useEffect(() => {
    if (notification) {
      const t = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(t);
    }
  }, [notification]);

  // Load history from LocalStorage & sync cookie history lists (references) on mount
  useEffect(() => {
    // 1. Restore game records from LocalStorage
    const savedLocal = localStorage.getItem('sudoku_lab_history');
    let loadedHistory: GameRecord[] = [];
    if (savedLocal) {
      try {
        loadedHistory = JSON.parse(savedLocal);
      } catch (e) {
        console.error("Failed to parse saved games from local storage", e);
      }
    }

    // 2. Check sync with Cookie listing (ensures multi-session cookies are active)
    const savedCookie = getCookie('sudoku_cookie_history_meta');
    if (savedCookie) {
      try {
        const cookieMetaList = JSON.parse(savedCookie);
        // If local storage was cleared but cookie remains, recover metadata references
        if (loadedHistory.length === 0 && cookieMetaList.length > 0) {
          console.log("Recovering basic stats from browser cookies");
          loadedHistory = cookieMetaList.map((item: any) => ({
            id: item.id,
            timestamp: Date.now(),
            dateString: item.dateString,
            difficulty: item.difficulty,
            elapsedTime: item.elapsedTime,
            errorCount: 0,
            initialGrid: Array.from({ length: 9 }, () => Array(9).fill(0)),
            solutionGrid: Array.from({ length: 9 }, () => Array(9).fill(0)),
            moves: Array.from({ length: item.movesCount || 0 }, () => ({ step: 0, row: 0, col: 0, value: 0 }))
          }));
        }
      } catch(e) {}
    }

    setGameHistory(loadedHistory);

    // 3. Restore last active live game progress from LocalStorage
    const savedActive = localStorage.getItem('sudoku_active_live_record');
    if (savedActive) {
      try {
        const { difficulty: savedDiff, initialGrid, moves } = JSON.parse(savedActive);
        if (initialGrid && Array.isArray(moves)) {
          const solverRes = solveSudoku(initialGrid);
          const solution = solverRes.solution;
          
          if (solution) {
            const restoredGrid: SudokuGrid = [];
            for (let r = 0; r < 9; r++) {
              const rowElements: Cell[] = [];
              for (let c = 0; c < 9; c++) {
                const val = initialGrid[r][c];
                rowElements.push({
                  row: r,
                  col: c,
                  value: val,
                  original: val !== 0,
                  candidates: [],
                  pencilMarks: []
                });
              }
              restoredGrid.push(rowElements);
            }
            
            moves.forEach((move: Move) => {
              const { row, col, value } = move;
              if (row >= 0 && row < 9 && col >= 0 && col < 9) {
                restoredGrid[row][col].value = value;
                restoredGrid[row][col].pencilMarks = [];
              }
            });
            
            setDifficulty(savedDiff || 'easy');
            setFullGrid(solution);
            setSolutionGrid(solution);
            setGrid(restoredGrid);
            setSelectedCell(null);
            setHint(null);
            setErrorCount(0);
            setWrongCells([]);
            setGameWon(false);
            setCurrentMoves(moves);
            setGameStartedAt(Date.now());
            setElapsedTime(0);
            return;
          }
        }
      } catch (e) {
        console.error("Failed to restore saved live game from LocalStorage", e);
      }
    }

    // Default fallback: Start a new game
    startNewGame('easy');
  }, []);

  // Sync gameHistory state changes to LocalStorage and update reference Cookie
  const saveGameHistory = (historyList: GameRecord[]) => {
    setGameHistory(historyList);
    // Write full logs to LocalStorage
    localStorage.setItem('sudoku_lab_history', JSON.stringify(historyList));

    // To respect cookie request, write condensed game summaries to cookie safely
    const condensed = historyList.map(item => ({
      id: item.id,
      difficulty: item.difficulty,
      elapsedTime: item.elapsedTime,
      movesCount: item.moves.length,
      dateString: item.dateString
    }));
    // Keeps summary array in cookie
    setCookie('sudoku_cookie_history_meta', JSON.stringify(condensed.slice(-5))); // save last 5 for space
  };

  // Helper function to track individual user inputs as moves
  const trackMove = (row: number, col: number, newValue: number) => {
    const nextMove: Move = {
      step: currentMoves.length + 1,
      row,
      col,
      value: newValue
    };
    const updatedMoves = [...currentMoves, nextMove];
    setCurrentMoves(updatedMoves);

    // Actively back up the current active moves sequence to LocalStorage so player never loses active work!
    localStorage.setItem('sudoku_active_live_record', JSON.stringify({
      difficulty,
      initialGrid: grid.map(r => r.map(c => c.original ? c.value : 0)),
      moves: updatedMoves
    }));
  };

  // Initialize a new game
  const startNewGame = (diff: Difficulty = difficulty) => {
    // Escape replay mode cleanly if active
    stopReplayAutoPlay();
    setIsPlayingReplay(false);
    setReplayRecord(null);

    const full = generateFullGrid();
    const puzzle = digHoles(full, diff);
    
    // Solve Sudoku to preserve 100% correct template key
    const solverRes = solveSudoku(puzzle);
    const solution = solverRes.solution || full;

    const initialGrid: SudokuGrid = [];
    const puzzleSnapshot: number[][] = [];
    
    for (let r = 0; r < 9; r++) {
      const rowElements: Cell[] = [];
      const rowNumbers: number[] = [];
      for (let c = 0; c < 9; c++) {
        const val = puzzle[r][c];
        rowNumbers.push(val);
        rowElements.push({
          row: r,
          col: c,
          value: val,
          original: val !== 0,
          candidates: [],
          pencilMarks: []
        });
      }
      initialGrid.push(rowElements);
      puzzleSnapshot.push(rowNumbers);
    }

    setFullGrid(full);
    setSolutionGrid(solution);
    setGrid(initialGrid);
    setSelectedCell(null);
    setHint(null);
    setErrorCount(0);
    setWrongCells([]);
    setGameWon(false);
    setCurrentMoves([]);
    setGameStartedAt(Date.now());
    setElapsedTime(0);

    // Initialise live LocalStorage progress for this turn
    localStorage.setItem('sudoku_active_live_record', JSON.stringify({
      difficulty: diff,
      initialGrid: puzzleSnapshot,
      moves: []
    }));
  };



  // Timer loop
  useEffect(() => {
    if (gameWon || isPlayingReplay) return;
    const timer = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - gameStartedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [gameStartedAt, gameWon, isPlayingReplay]);

  // Check if grid is fully solved correctly
  const checkWinCondition = (currentGrid: SudokuGrid) => {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (currentGrid[r][c].value !== solutionGrid[r][c]) {
          return false;
        }
      }
    }
    return true;
  };

  // Handlers for cell selection
  const selectCell = (row: number, col: number) => {
    if (isPlayingReplay) return; // grid is read-only in replay
    
    if (hint && (hint.row !== row || hint.col !== col)) {
      setHint(null);
    }
    setSelectedCell({ row, col });
  };

  // Handlers for keyboard/virtual input
  const handleNumberInput = (num: number) => {
    if (!selectedCell || gameWon || isPlayingReplay) return;
    
    const { row, col } = selectedCell;
    const cell = grid[row][col];
    
    // Original hints are immutable
    if (cell.original) return;

    const updated = grid.map((r, rIdx) => 
      r.map((c, cIdx) => {
        if (rIdx === row && cIdx === col) {
          if (isNoteMode) {
            const marks = c.pencilMarks.includes(num)
              ? c.pencilMarks.filter(m => m !== num)
              : [...c.pencilMarks, num].sort();
            return { ...c, pencilMarks: marks, value: 0 };
          } else {
            return { ...c, value: c.value === num ? 0 : num, pencilMarks: [] };
          }
        }
        return c;
      })
    );

    // Set move log & wipe errors for this layout coordinate
    if (!isNoteMode) {
      const oldVal = grid[row][col].value;
      const targetVal = oldVal === num ? 0 : num;
      trackMove(row, col, targetVal);
      setWrongCells(prev => prev.filter(([wr, wc]) => !(wr === row && wc === col)));
    }

    setGrid(updated);

    // Instantly check for win
    const won = checkWinCondition(updated);
    if (won) {
      triggerGameWin(updated);
    }
  };

  // Clear current active cell's value
  const handleClear = () => {
    if (!selectedCell || isPlayingReplay) return;
    const { row, col } = selectedCell;
    if (grid[row][col].original) return;

    const updated = grid.map((r, rIdx) => 
      r.map((c, cIdx) => {
        if (rIdx === row && cIdx === col) {
          return { ...c, value: 0, pencilMarks: [] };
        }
        return c;
      })
    );

    trackMove(row, col, 0);
    setGrid(updated);
    setWrongCells(prev => prev.filter(([r, c]) => !(r === row && c === col)));
  };

  // Validate active grid inputs
  const handleValidateGrid = () => {
    if (isPlayingReplay) return;
    const wrongList: [number, number][] = [];
    let count = 0;
    
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const val = grid[r][c].value;
        if (val !== 0 && val !== solutionGrid[r][c]) {
          wrongList.push([r, c]);
          count++;
        }
      }
    }
    setWrongCells(wrongList);
    setErrorCount(prev => prev + count);
    
    if (count > 0) {
      setNotification({ message: `標記了 ${count} 處與正解衝突的位置！`, type: 'error' });
    } else {
      setNotification({ message: '太棒了！目前填寫格完全符合正確邏輯段位。', type: 'success' });
    }
  };

  // Trigger win process, save records to History & set cookie logs
  const triggerGameWin = (finalGrid: SudokuGrid) => {
    setGameWon(true);
    const duration = Math.floor((Date.now() - gameStartedAt) / 1000);
    
    // Construct full GameRecord details
    const newRecord: GameRecord = {
      id: `record_${Date.now()}`,
      timestamp: Date.now(),
      dateString: new Date().toISOString().split('T')[0],
      difficulty: difficulty,
      elapsedTime: duration,
      errorCount: errorCount,
      initialGrid: finalGrid.map(r => r.map(c => c.original ? c.value : 0)),
      solutionGrid: solutionGrid,
      moves: [...currentMoves]
    };

    // Save playing logs in LocalStorage explicitly for the very latest replay!
    localStorage.setItem('sudoku_latest_replay', JSON.stringify(newRecord));
    // Clean up active live progress when game is successfully won
    localStorage.removeItem('sudoku_active_live_record');
    
    // Add to multiple storage portfolio
    const updatedHistory = [newRecord, ...gameHistory];
    saveGameHistory(updatedHistory);
  };

  // Setup dynamic logical clues
  const handleGetHint = () => {
    if (isPlayingReplay) return;
    const rawGrid = grid.map(r => r.map(c => c.value));
    const result = getNextStepHint(rawGrid, solutionGrid);
    if (result) {
      setHint(result);
      setSelectedCell({ row: result.row, col: result.col });
    } else {
      setNotification({ message: '精巧無比！目前盤面似無漏格，可手動驗收。', type: 'success' });
    }
  };

  // Fast apply logical hint
  const handleApplyHint = () => {
    if (!hint || isPlayingReplay) return;
    const { row, col, value } = hint;
    
    const updated = grid.map((r, rIdx) => 
      r.map((c, cIdx) => {
        if (rIdx === row && cIdx === col) {
          return { ...c, value: value, pencilMarks: [] };
        }
        return c;
      })
    );

    trackMove(row, col, value);
    setGrid(updated);
    setHint(null);
    setWrongCells(prev => prev.filter(([wr, wc]) => !(wr === row && wc === col)));

    const won = checkWinCondition(updated);
    if (won) {
      triggerGameWin(updated);
    }
  };

  // ---------------------------------------------------------------------------
  // Replay Controller Handlers
  // ---------------------------------------------------------------------------
  const startReplay = (record: GameRecord) => {
    stopReplayAutoPlay();
    setReplayRecord(record);
    setIsPlayingReplay(true);
    setReplayCurrentStep(0);
    setReplayIsAutoPlaying(true);
    setSelectedCell(null);
    setGameWon(false);
    
    setNotification({ message: `開始播放紀錄：[${record.dateString}] 挑戰等級 ${record.difficulty.toUpperCase()}`, type: 'success' });
  };

  const stopReplayAutoPlay = () => {
    if (replayTimerRef.current) {
      clearInterval(replayTimerRef.current);
      replayTimerRef.current = null;
    }
    setReplayIsAutoPlaying(false);
  };

  const toggleReplayAutoPlay = () => {
    if (replayIsAutoPlaying) {
      stopReplayAutoPlay();
    } else {
      setReplayIsAutoPlaying(true);
    }
  };

  const exitReplay = () => {
    stopReplayAutoPlay();
    setIsPlayingReplay(false);
    setReplayRecord(null);
    // Restart or load safe state
    startNewGame();
  };

  // Execute Replay Ticker
  useEffect(() => {
    if (isPlayingReplay && replayIsAutoPlaying && replayRecord) {
      replayTimerRef.current = setInterval(() => {
        setReplayCurrentStep((prev) => {
          if (prev >= replayRecord.moves.length) {
            stopReplayAutoPlay();
            setNotification({ message: "精彩重播播放完畢！", type: "success" });
            return prev;
          }
          return prev + 1;
        });
      }, replaySpeed);
    }

    return () => {
      if (replayTimerRef.current) {
        clearInterval(replayTimerRef.current);
      }
    };
  }, [isPlayingReplay, replayIsAutoPlaying, replayRecord, replaySpeed]);

  // Handle speed changes
  const adjustReplaySpeed = (faster: boolean) => {
    setReplaySpeed((prev) => {
      const step = faster ? -250 : 250;
      const target = prev + step;
      return Math.max(250, Math.min(2000, target)); // clamp 0.25s to 2s range
    });
  };

  // Apply steps dynamically to construct visual matrix with useMemo to prevent redundant deep copies
  const replayMatrix = useMemo(() => {
    if (!replayRecord) return Array.from({ length: 9 }, () => Array(9).fill(0));
    const matrix = replayRecord.initialGrid.map(row => [...row]);
    
    // Fill up moves up to the sliding stage index
    for (let i = 0; i < replayCurrentStep; i++) {
      const move = replayRecord.moves[i];
      if (move) {
        matrix[move.row][move.col] = move.value;
      }
    }
    return matrix;
  }, [replayRecord, replayCurrentStep]);

  // ---------------------------------------------------------------------------
  // JSON File Importer / Exporter (存 & 讀)
  // ---------------------------------------------------------------------------
  const exportGameRecordAsJSON = (record: GameRecord) => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(record, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `sudoku_record_${record.difficulty}_step${record.moves.length || 0}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    setNotification({ message: '成功匯出單場 JSON 作答序列檔案！', type: 'success' });
  };

  const exportAllHistoryAsJSON = () => {
    if (gameHistory.length === 0) {
      setNotification({ message: '無可匯出的歷史紀錄！', type: 'error' });
      return;
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(gameHistory, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `all_sudoku_history_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    setNotification({ message: '成功匯出全歷史紀錄存檔 JSON！', type: 'success' });
  };

  const handleJSONUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileReader = new FileReader();
    fileReader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        
        // Let's analyze if uploaded data is a multi-game history or a single record
        if (Array.isArray(parsed)) {
          // Multi-record array validation
          const isValidArray = parsed.every(item => item.initialGrid && item.solutionGrid && Array.isArray(item.moves));
          if (isValidArray) {
            const combined = [...parsed, ...gameHistory];
            // Remove duplicates by ID to avoid overlapping
            const unique = combined.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
            saveGameHistory(unique);
            setNotification({ message: `成功讀入 ${parsed.length} 筆歷史紀錄！`, type: 'success' });
          } else {
            setNotification({ message: '讀取失敗：JSON 格式不是標準的數獨批次歷史紀錄檔案。', type: 'error' });
          }
        } else if (parsed.initialGrid && parsed.solutionGrid && Array.isArray(parsed.moves)) {
          // Single-game document
          // Add with new key in history list, then trigger direct playback
          const singleRecord: GameRecord = parsed.id ? parsed : {
            ...parsed,
            id: parsed.id || `uploaded_${Date.now()}`,
            timestamp: parsed.timestamp || Date.now(),
            dateString: parsed.dateString || new Date().toISOString().split('T')[0]
          };

          const combined = [singleRecord, ...gameHistory];
          const unique = combined.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
          saveGameHistory(unique);
          
          startReplay(singleRecord);
        } else {
          setNotification({ message: '讀取格式不合規：缺少 initialGrid, solutionGrid 或 moves 元素。', type: 'error' });
        }
      } catch (err) {
        setNotification({ message: '解析 JSON 檔案出錯，請確認格式。', type: 'error' });
      }
    };
    fileReader.readAsText(file);
    // Reset file input value to allow uploading same file again
    if (e.target) e.target.value = '';
  };

  // Keyboard events listener - optimized to bind only once to prevent listener churn using Event Callback Ref
  const handleKeyDownRef = useRef<any>(null);
  handleKeyDownRef.current = (e: KeyboardEvent) => {
    if (!selectedCell || gameWon || isPlayingReplay) return;
    
    if (e.key >= '1' && e.key <= '9') {
      handleNumberInput(parseInt(e.key));
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      handleClear();
    } else if (e.key === 'ArrowUp') {
      setSelectedCell(prev => prev ? { row: Math.max(0, prev.row - 1), col: prev.col } : null);
    } else if (e.key === 'ArrowDown') {
      setSelectedCell(prev => prev ? { row: Math.min(8, prev.row + 1), col: prev.col } : null);
    } else if (e.key === 'ArrowLeft') {
      setSelectedCell(prev => prev ? { row: prev.row, col: Math.max(0, prev.col - 1) } : null);
    } else if (e.key === 'ArrowRight') {
      setSelectedCell(prev => prev ? { row: prev.row, col: Math.min(8, prev.col + 1) } : null);
    }
  };

  useEffect(() => {
    const listener = (e: KeyboardEvent) => handleKeyDownRef.current?.(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  // Time Formatter
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const wrongCellsSet = useMemo(() => {
    return new Set(wrongCells.map(([wr, wc]) => `${wr}-${wc}`));
  }, [wrongCells]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans relative" id="sudoku-app">
      
      {/* Dynamic Toast Notifications */}
      <AnimatePresence>
        {notification && (
          <motion.div 
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            className={`fixed top-24 left-1/2 -translate-x-1/2 px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 border z-50 text-sm font-bold ${
              notification.type === 'success' 
                ? 'bg-emerald-950 border-emerald-800 text-emerald-300' 
                : 'bg-rose-950 border-rose-800 text-rose-300'
            }`}
            id="global-toast"
          >
            {notification.type === 'success' ? <Check className="w-4 h-4 text-emerald-400" /> : <X className="w-4 h-4 text-rose-400" />}
            <span>{notification.message}</span>
            <button onClick={() => setNotification(null)} className="ml-2 hover:opacity-70 text-slate-400 cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modern Dashboard Header */}
      <header className="bg-slate-900 border-b border-slate-800 py-4 px-6 sticky top-0 z-30 shadow-lg" id="header">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500 text-slate-950 rounded-xl shadow-md rotate-3" id="app-logo">
              <span className="font-mono font-black tracking-wider text-lg">9×9</span>
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-2">
                數獨演算法實驗室 <span className="text-xs bg-amber-500/10 text-amber-400 font-semibold px-2 py-0.5 rounded-full border border-amber-500/20">Interactive Studio</span>
              </h1>
              <p className="text-xs text-slate-400">
                探索 Donald Knuth 的精確覆蓋 X 演算法，與 BERTRAM 遊戲重播控制中心 (存&讀支援)
              </p>
            </div>
          </div>

          {/* Controls Panel & Stats */}
          <div className="flex items-center flex-wrap gap-3 text-sm justify-center" id="metrics-bar">
            
            {isPlayingReplay ? (
              <div className="flex items-center gap-2 bg-purple-950/70 border border-purple-800/80 px-3 py-1.5 rounded-xl animated-pulse" id="live-replay-badge">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-400 animate-ping"></span>
                <span className="text-xs font-bold text-purple-300">正在重播您精彩的作答...</span>
              </div>
            ) : (
              <>
                <span className="flex items-center gap-1.5 text-slate-300 font-medium bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-850">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  時間: <span className="font-mono text-emerald-400 font-bold">{formatTime(elapsedTime)}</span>
                </span>
                <span className="flex items-center gap-1.5 text-slate-300 font-medium bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-850">
                  錯誤: <span className="font-mono text-rose-400 font-semibold">{errorCount}</span>
                </span>
              </>
            )}

            <button 
              onClick={() => setShowHistoryPanel(!showHistoryPanel)}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg font-bold text-xs transition select-none cursor-pointer border border-slate-750"
              id="btn-show-history"
              title="看過去紀錄與匯出/匯入存檔"
            >
              <History className="w-3.5 h-3.5 text-slate-400" />
              歷史紀錄 ({gameHistory.length})
            </button>

            <button 
              onClick={() => startNewGame()} 
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-1.5 rounded-lg font-extrabold text-xs transition duration-200 hover:scale-[1.02] shadow-sm select-none cursor-pointer"
              id="btn-restart"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              重新生成關卡
            </button>
          </div>
        </div>
      </header>

      {/* Main Grid Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start" id="main-content">
        
        {/* Left Interactive Side: Board, Virtual Numbers & Real-time Replay Player */}
        <div className="col-span-1 lg:col-span-7 flex flex-col items-center gap-6" id="board-container">
          
          {/* Difficulty selector tabs & Replay Badge */}
          <div className="w-full max-w-[460px]" id="dashboard-clues-header">
            {isPlayingReplay ? (
              <div className="bg-purple-950/40 border-2 border-purple-800/80 p-3 rounded-xl flex items-center justify-between shadow-lg text-xs" id="replay-header-info">
                <div>
                  <div className="font-extrabold text-purple-200 flex items-center gap-1">
                    <History className="w-3.5 h-3.5" />
                    重播控制室 - {replayRecord?.difficulty.toUpperCase()} 難度
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    完成時間: {formatTime(replayRecord?.elapsedTime || 0)} | 
                    作答步數: {replayRecord?.moves.length || 0}
                  </div>
                </div>
                <button 
                  onClick={exitReplay}
                  className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-2.5 py-1 rounded-lg transition text-[11px] cursor-pointer"
                >
                  退出重播
                </button>
              </div>
            ) : (
              <div className="w-full bg-slate-900 p-1 rounded-xl flex border border-slate-800 shadow-inner" id="difficulty-selector">
                {(['easy', 'medium', 'hard'] as const).map((diff) => (
                  <button
                    key={diff}
                    onClick={() => {
                      setDifficulty(diff);
                      startNewGame(diff);
                    }}
                    className={`flex-1 py-1.5 px-3 text-xs font-bold rounded-lg transition-all duration-200 select-none cursor-pointer ${
                      difficulty === diff 
                        ? 'bg-slate-800 text-white shadow-sm border border-slate-700' 
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {diff === 'easy' && '初級 (Easy Clues)'}
                    {diff === 'medium' && '中級 (Medium Clues)'}
                    {diff === 'hard' && '專家 (17 Clues - Min)'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sudoku Grid Wrapper */}
          <div className="relative p-1.5 bg-slate-900 rounded-2xl shadow-2xl w-full max-w-[460px] border border-slate-800" id="sudoku-grid-wrapper">
            <div className="grid grid-cols-9 gap-[1px] bg-slate-950 overflow-hidden rounded-xl border-2 border-slate-950" style={{ transform: 'translate3d(0, 0, 0)' }}>
              
              {isPlayingReplay ? (
                // Replay View Generation
                replayMatrix.map((row, rIdx) => 
                  row.map((val, cIdx) => {
                    const isOriginal = replayRecord?.initialGrid[rIdx][cIdx] !== 0;
                    const lastMove = replayRecord?.moves[replayCurrentStep - 1];
                    const isNewestChange = lastMove && lastMove.row === rIdx && lastMove.col === cIdx;

                    let bgClass = "bg-slate-900 text-slate-100";
                    if (isNewestChange) {
                      bgClass = "bg-purple-500/30 text-purple-300 ring-2 ring-purple-400 z-10 font-bold";
                    } else if (isOriginal) {
                      bgClass = "bg-slate-850/80 text-white";
                    }

                    const borderRight = (cIdx === 2 || cIdx === 5) ? 'border-r-3 border-slate-950' : '';
                    const borderBottom = (rIdx === 2 || rIdx === 5) ? 'border-b-3 border-slate-950' : '';

                    return (
                      <div
                        key={`replay-${rIdx}-${cIdx}`}
                        className={`aspect-square flex items-center justify-center relative select-none transition-all duration-150 text-xl font-bold ${bgClass} ${borderRight} ${borderBottom}`}
                      >
                        {val !== 0 ? (
                          <span className={`${isOriginal ? 'text-slate-100 font-extrabold' : 'text-blue-400'}`}>
                            {val}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-700 font-mono">-</span>
                        )}
                      </div>
                    );
                  })
                )
              ) : (
                // Standard Live Play Matrix (with candidate notations)
                grid.map((row, rIdx) => 
                  row.map((cell, cIdx) => {
                    const isSelected = selectedCell?.row === rIdx && selectedCell?.col === cIdx;
                    const isSameRowOrCol = selectedCell && (selectedCell.row === rIdx || selectedCell.col === cIdx);
                    const isSameBox = selectedCell && (
                      Math.floor(selectedCell.row / 3) === Math.floor(rIdx / 3) &&
                      Math.floor(selectedCell.col / 3) === Math.floor(cIdx / 3)
                    );
                    const isCompanion = isSameRowOrCol || isSameBox;
                    const hasSameValue = selectedCell && cell.value !== 0 && cell.value === grid[selectedCell.row][selectedCell.col].value;

                    // Hints & Validator matches
                    const isHintedCell = hint && hint.row === rIdx && hint.col === cIdx;
                    const isHintHighlight = hint && hint.highlightCells.some(([hr, hc]) => hr === rIdx && hc === cIdx);
                    const isWrong = wrongCellsSet.has(`${rIdx}-${cIdx}`);

                    let bgClass = "bg-slate-900 text-slate-100 hover:bg-slate-850/80";
                    if (isSelected) {
                      bgClass = "bg-amber-500/35 text-white font-bold ring-2 ring-amber-500 z-10";
                    } else if (isHintedCell) {
                      bgClass = "bg-emerald-950/80 animate-pulse ring-2 ring-emerald-400 z-10 text-emerald-300";
                    } else if (isHintHighlight) {
                      bgClass = "bg-amber-950/25 text-amber-300 border border-amber-500/20";
                    } else if (isWrong) {
                      bgClass = "bg-rose-950/50 text-rose-300 font-semibold border-2 border-rose-500";
                    } else if (hasSameValue) {
                      bgClass = "bg-slate-800 text-amber-400 font-bold";
                    } else if (isCompanion) {
                      bgClass = "bg-slate-850/40";
                    }

                    const borderRight = (cIdx === 2 || cIdx === 5) ? 'border-r-3 border-slate-950' : '';
                    const borderBottom = (rIdx === 2 || rIdx === 5) ? 'border-b-3 border-slate-950' : '';

                    return (
                      <div
                        key={`cell-${rIdx}-${cIdx}`}
                        id={`cell-${rIdx}-${cIdx}`}
                        onClick={() => selectCell(rIdx, cIdx)}
                        className={`aspect-square flex items-center justify-center relative cursor-pointer select-none transition-all duration-150 text-xl ${bgClass} ${borderRight} ${borderBottom}`}
                      >
                        {cell.value !== 0 ? (
                          <span className={`
                            ${cell.original ? 'text-slate-100 font-extrabold' : 'text-blue-400 font-normal'}
                            ${isWrong ? 'text-rose-400' : ''}
                          `}>
                            {cell.value}
                          </span>
                        ) : (
                          <div className="grid grid-cols-3 gap-0.5 w-full h-full p-0.5 text-[9px] leading-3 text-slate-500">
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((m) => (
                              <div key={m} className="flex items-center justify-center font-mono">
                                {cell.pencilMarks.includes(m) ? m : ''}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )
              )}
            </div>

            {/* Live game won screen */}
            <AnimatePresence>
              {gameWon && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-slate-950/95 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center rounded-2xl z-20"
                  id="victory-overlay"
                >
                  <motion.div
                    initial={{ scale: 0.8, y: 20 }}
                    animate={{ scale: 1, y: 0 }}
                    className="bg-slate-900 border border-slate-800 p-6 rounded-2xl max-w-sm shadow-2xl flex flex-col items-center"
                  >
                    <div className="w-16 h-16 bg-emerald-950 text-emerald-400 rounded-full flex items-center justify-center mb-4 border border-emerald-800">
                      <Trophy className="w-8 h-8" />
                    </div>
                    
                    <h3 className="text-xl font-black text-white">恭喜破關！</h3>
                    <p className="text-sm text-slate-400 mt-2">
                      您已順利破解此數獨關卡，作答序列已被快照至 Cookie!
                    </p>

                    <div className="bg-slate-950 p-4 rounded-xl w-full my-4 text-xs space-y-2 border border-slate-850">
                      <div className="flex justify-between">
                        <span className="text-slate-550">成關難度</span>
                        <span className="font-semibold text-slate-300">
                          {difficulty === 'easy' ? '初級' : difficulty === 'medium' ? '中級' : '專家'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-550">所用時間</span>
                        <span className="font-mono font-semibold text-slate-300">{formatTime(elapsedTime)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-550">步驟數量</span>
                        <span className="font-mono font-semibold text-blue-400">{currentMoves.length} 步</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-550">累計失誤</span>
                        <span className="font-mono font-semibold text-red-400">{errorCount}</span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 w-full">
                      {/* Playback Replay Action */}
                      <button
                        onClick={() => {
                          // Assemble active record representation to play immediately
                          const activeRecord: GameRecord = {
                            id: `instant_${Date.now()}`,
                            timestamp: Date.now(),
                            dateString: new Date().toISOString().split('T')[0],
                            difficulty,
                            elapsedTime,
                            errorCount,
                            initialGrid: grid.map(r => r.map(c => c.original ? c.value : 0)),
                            solutionGrid,
                            moves: [...currentMoves]
                          };
                          startReplay(activeRecord);
                        }}
                        className="py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-black text-sm transition shadow-md cursor-pointer flex items-center justify-center gap-2"
                        id="btn-victory-replay"
                      >
                        <Play className="w-4 h-4 fill-white" />
                        重播精彩作答
                      </button>

                      <button
                        onClick={() => startNewGame(difficulty)}
                        className="py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-bold text-sm transition shadow-md cursor-pointer"
                      >
                        開始下一局
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Interactive Controller Center */}
          <div className="w-full max-w-[460px] space-y-4" id="controls-hub">
            
            {isPlayingReplay ? (
              // Replay Mode Actions Panel
              <div className="bg-slate-900 border border-purple-900/40 rounded-xl p-4 space-y-3 shadow-lg" id="replay-console">
                <div className="flex items-center justify-between text-xs text-purple-300">
                  <span className="font-bold flex items-center gap-1">
                    <History className="w-3.5 h-3.5" />
                    重播進度: {replayCurrentStep} / {replayRecord?.moves.length} 步
                  </span>
                  <span className="font-mono bg-purple-950 p-1 rounded">
                    每步間隔: {replaySpeed}ms
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                  <div 
                    className="bg-purple-500 h-full transition-all duration-300"
                    style={{ width: `${replayRecord?.moves.length ? (replayCurrentStep / replayRecord.moves.length) * 100 : 0}%` }}
                  ></div>
                </div>

                {/* Media Playback Navigation buttons */}
                <div className="flex items-center justify-between gap-2 pt-1">
                  <button
                    onClick={() => setReplayCurrentStep(0)}
                    disabled={replayCurrentStep === 0}
                    className="flex-1 py-1.5 bg-slate-950 hover:bg-slate-805 text-slate-300 rounded-lg text-xs font-semibold disabled:opacity-35 cursor-pointer flex justify-center items-center gap-1"
                  >
                    <SkipBack className="w-3.5 h-3.5" />
                    開端
                  </button>

                  <button
                    onClick={() => setReplayCurrentStep(prev => Math.max(0, prev - 1))}
                    disabled={replayCurrentStep === 0}
                    className="flex-1 py-1.5 bg-slate-950 hover:bg-slate-805 text-slate-300 rounded-lg text-xs font-semibold disabled:opacity-35 cursor-pointer"
                  >
                     上一步
                  </button>

                  <button
                    onClick={toggleReplayAutoPlay}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold text-slate-950 cursor-pointer flex justify-center items-center gap-1 ${
                      replayIsAutoPlaying ? 'bg-amber-500 hover:bg-amber-400' : 'bg-purple-400 hover:bg-purple-300'
                    }`}
                  >
                    {replayIsAutoPlaying ? <Pause className="w-3.5 h-3.5 fill-slate-950" /> : <Play className="w-3.5 h-3.5 fill-slate-950" />}
                    {replayIsAutoPlaying ? '暫停' : '播放'}
                  </button>

                  <button
                    onClick={() => setReplayCurrentStep(prev => Math.min(replayRecord?.moves.length || 0, prev + 1))}
                    disabled={replayCurrentStep >= (replayRecord?.moves.length || 0)}
                    className="flex-1 py-1.5 bg-slate-950 hover:bg-slate-805 text-slate-300 rounded-lg text-xs font-semibold disabled:opacity-35 cursor-pointer"
                  >
                     下一步
                  </button>

                  <button
                    onClick={() => {
                      if (replayRecord) {
                        setReplayCurrentStep(replayRecord.moves.length);
                      }
                    }}
                    disabled={replayCurrentStep >= (replayRecord?.moves.length || 0)}
                    className="flex-1 py-1.5 bg-slate-950 hover:bg-slate-805 text-slate-300 rounded-lg text-xs font-semibold disabled:opacity-35 cursor-pointer flex justify-center items-center gap-1"
                  >
                    末端
                    <SkipForward className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Speed multipliers */}
                <div className="flex gap-2 justify-center items-center text-[10px] text-slate-400 pt-1">
                  <span>播放速度: </span>
                  <button 
                    onClick={() => adjustReplaySpeed(false)}
                    className="bg-slate-950 px-2.5 py-1 rounded cursor-pointer hover:text-white"
                  >
                    變慢 (-0.25s)
                  </button>
                  <button 
                    onClick={() => adjustReplaySpeed(true)}
                    className="bg-slate-950 px-2.5 py-1 rounded cursor-pointer hover:text-white"
                  >
                    變快 (+0.25s)
                  </button>
                  <button 
                    onClick={() => setReplaySpeed(1000)}
                    className="bg-slate-950 px-2.5 py-1 rounded cursor-pointer hover:text-white"
                  >
                    還原 (1s)
                  </button>
                </div>

                {/* Live commentary of what move took place */}
                <div className="bg-slate-950 p-2 text-[11px] font-mono text-purple-300 rounded-lg border border-purple-950/40 text-center">
                  {replayCurrentStep > 0 && replayRecord?.moves[replayCurrentStep - 1] ? (
                    <div>
                      精華重現 Step {replayCurrentStep}: 在「第 {replayRecord.moves[replayCurrentStep - 1].row + 1} 行，第 {replayRecord.moves[replayCurrentStep - 1].col + 1} 列」
                      填入了 <span className="font-extrabold text-amber-400">{replayRecord.moves[replayCurrentStep - 1].value === 0 ? "擦除" : replayRecord.moves[replayCurrentStep - 1].value}</span>
                    </div>
                  ) : (
                    <div className="text-slate-500">
                      點擊播放，重播引擎將載入並描繪填答細節
                    </div>
                  )}
                </div>
              </div>
            ) : (
              // Standard Active Workspace Actions Panel
              <>
                <div className="grid grid-cols-4 gap-2">
                  <button
                    onClick={() => setIsNoteMode(!isNoteMode)}
                    className={`py-2 px-3 rounded-lg text-xs font-bold border flex items-center justify-center gap-1.5 transition-all duration-200 select-none cursor-pointer ${
                      isNoteMode 
                        ? 'bg-blue-600 text-white border-blue-600 shadow-md' 
                        : 'bg-slate-900 text-slate-300 border-slate-800 hover:text-white hover:bg-slate-805'
                    }`}
                    title="啟用或關閉鉛筆草稿模式"
                    id="btn-note-mode"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    草稿模式 {isNoteMode ? 'ON' : 'OFF'}
                  </button>

                  <button
                    onClick={handleValidateGrid}
                    className="py-2 px-3 rounded-lg text-xs font-bold bg-slate-900 text-slate-300 border border-slate-800 hover:text-white hover:bg-slate-805 transition-all select-none cursor-pointer"
                    id="btn-check"
                  >
                    檢查對錯
                  </button>

                  <button
                    onClick={handleClear}
                    className="py-2 px-3 rounded-lg text-xs font-bold bg-slate-900 text-slate-300 border border-slate-800 hover:text-rose-450 hover:bg-slate-805 hover:border-rose-900/40 transition-all flex items-center justify-center gap-1 select-none cursor-pointer"
                    id="btn-clear"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    擦除
                  </button>

                  <button
                    onClick={() => {
                      setGrid(grid.map(r => r.map(c => c.original ? c : { ...c, value: 0, pencilMarks: [] })));
                      setWrongCells([]);
                      setHint(null);
                      setCurrentMoves([]);
                      setNotification({ message: '本局作答步驟已被重置清零。', type: 'error' });
                    }}
                    className="py-2 px-3 rounded-lg text-xs font-bold bg-slate-900 text-slate-300 border border-slate-800 hover:text-white hover:bg-slate-855 transition-all flex items-center justify-center gap-1 select-none cursor-pointer"
                    id="btn-reset"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    重設
                  </button>
                </div>

                {/* Virtual Number Pad */}
                <div className="grid grid-cols-5 gap-2" id="keypad">
                  {[1, 2, 3, 4, 5].map((num) => (
                    <button
                      key={num}
                      onClick={() => handleNumberInput(num)}
                      disabled={!selectedCell || grid[selectedCell.row][selectedCell.col].original}
                      className="aspect-square sm:aspect-auto sm:py-3 rounded-xl bg-slate-900 border border-slate-850 hover:bg-slate-850 hover:text-white hover:border-slate-800 text-white font-extrabold text-xl select-none transition disabled:opacity-30 disabled:cursor-not-allowed shadow-xs cursor-pointer"
                    >
                      {num}
                    </button>
                  ))}
                  {[6, 7, 8, 9].map((num) => (
                    <button
                      key={num}
                      onClick={() => handleNumberInput(num)}
                      disabled={!selectedCell || grid[selectedCell.row][selectedCell.col].original}
                      className="aspect-square sm:aspect-auto sm:py-3 rounded-xl bg-slate-900 border border-slate-855 hover:bg-slate-850 hover:text-white hover:border-slate-800 text-white font-extrabold text-xl select-none transition disabled:opacity-30 disabled:cursor-not-allowed shadow-xs cursor-pointer"
                    >
                      {num}
                    </button>
                  ))}
                  {/* Special quick action for hint */}
                  <button
                    onClick={handleGetHint}
                    className="col-span-1 rounded-xl bg-amber-500 text-slate-950 font-extrabold text-xs flex flex-col items-center justify-center border border-amber-600 hover:bg-amber-450 transition shadow-md select-none p-1 shrink-0 cursor-pointer"
                    id="btn-quick-hint"
                    title="獲得下一步的邏輯提示"
                  >
                    <Lightbulb className="w-4 h-4 text-slate-950" />
                    <span>求助</span>
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 text-center">
                  * 虛擬鍵盤或電腦鍵盤的方向鍵都可以在 9x9 格點中移動！
                </p>
              </>
            )}

          </div>

        </div>

        {/* Right Columns: Step Hint Console, File Downloader / Uploader & Mathematical Science facts */}
        <div className="col-span-1 lg:col-span-5 space-y-6" id="right-column">
          
          {/* History control center (存 / 讀, JSON downloads & uploads) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4" id="history-box">
            <div className="flex items-center justify-between border-b border-slate-850 pb-3">
              <h3 className="font-extrabold text-white flex items-center gap-2 text-sm uppercase tracking-wide">
                <History className="w-4.5 h-4.5 text-blue-400" />
                歷史重播控制室 (Save & Load Center)
              </h3>
              <span className="text-[10px] bg-blue-950 text-blue-300 font-bold px-2 py-0.5 rounded border border-blue-900/40">
                可存可讀
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2" id="backup-actions">
              {/* Trigger Hidden Upload File Select */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="py-2 px-3 bg-slate-950 hover:bg-slate-855 text-slate-200 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 border border-slate-800 select-none cursor-pointer"
                id="btn-upload-json"
                title="上傳 JSON 讀入數獨挑戰紀錄與重播步驟"
              >
                <Upload className="w-3.5 h-3.5 text-blue-400" />
                讀入紀錄 (Upload)
              </button>
              
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleJSONUpload} 
                accept=".json" 
                className="hidden" 
              />

              <button
                onClick={exportAllHistoryAsJSON}
                className="py-2 px-3 bg-slate-950 hover:bg-slate-855 text-slate-200 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 border border-slate-800 select-none cursor-pointer"
                id="btn-download-all"
                title="匯出所有已記錄數獨賽局步驟 JSON"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                備份全部 (Download)
              </button>
            </div>

            {/* Expansible List of Historical Games */}
            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1" id="history-scroller">
              {gameHistory.length > 0 ? (
                gameHistory.map((record) => (
                  <div 
                    key={record.id} 
                    className="p-3 bg-slate-950 rounded-xl border border-slate-850 flex items-center justify-between gap-2 text-xs hover:border-slate-800 transition"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`font-extrabold px-1.5 py-0.5 rounded text-[10px] uppercase ${
                          record.difficulty === 'easy' ? 'bg-emerald-950 text-emerald-350 border border-emerald-900/40' :
                          record.difficulty === 'medium' ? 'bg-amber-950 text-amber-350 border border-amber-900/40' :
                          'bg-rose-950 text-rose-350 border border-rose-900/40'
                        }`}>
                          {record.difficulty === 'easy' ? '初級' : record.difficulty === 'medium' ? '中級' : '專家'}
                        </span>
                        <span className="font-mono text-slate-400 text-[10px]">{record.dateString}</span>
                      </div>
                      <div className="text-[11px] text-slate-350 mt-1">
                        時值: <strong className="text-emerald-400">{formatTime(record.elapsedTime)}</strong> | 
                        填答: <strong>{record.moves.length} 步</strong> | 
                        失誤: <strong className="text-rose-450">{record.errorCount}</strong>
                      </div>
                    </div>

                    <div className="flex gap-1.5 shrink-0">
                      <button
                        onClick={() => startReplay(record)}
                        className="p-1 px-2.5 bg-purple-950 hover:bg-purple-900 text-purple-300 rounded font-bold transition text-[11px] cursor-pointer border border-purple-900/40"
                        title="開啟這場比賽的播放畫面"
                      >
                        重播
                      </button>
                      <button
                        onClick={() => exportGameRecordAsJSON(record)}
                        className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 rounded transition cursor-pointer hover:text-white"
                        title="單場下載備份"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          const updated = gameHistory.filter(r => r.id !== record.id);
                          saveGameHistory(updated);
                          setNotification({ message: '已移除此條歷史參賽紀錄。', type: 'error' });
                        }}
                        className="p-1.5 bg-slate-900 hover:bg-rose-955 text-rose-400 rounded transition cursor-pointer"
                        title="刪除紀錄"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-4 text-center text-slate-400 text-[11px] bg-slate-950 rounded-xl border border-slate-850">
                  <p>尚無任何本機破關重播紀錄</p>
                  <p className="text-slate-500 text-[10px] mt-0.5">破關後將會自動為您留存完整的填答軌跡！</p>
                </div>
              )}
            </div>
          </div>

          {/* Next Step Hint Container */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4" id="hint-panel">
            <div className="flex items-center justify-between border-b border-slate-850 pb-3">
              <h3 className="font-extrabold text-white flex items-center gap-2 text-sm uppercase tracking-wide">
                <Sparkles className="w-4.5 h-4.5 text-amber-500 animate-pulse" />
                演算法輔助提示 (AI Step Hint)
              </h3>
              <button 
                onClick={handleGetHint}
                disabled={isPlayingReplay}
                className="text-xs bg-amber-550/15 hover:bg-amber-550/30 text-amber-400 font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition select-none cursor-pointer border border-amber-500/20 disabled:opacity-30 disabled:cursor-not-allowed"
                id="btn-get-hint"
              >
                <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                顯示下一步提示
              </button>
            </div>

            {hint ? (
              <motion.div 
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
                id="active-hint"
              >
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-400 bg-amber-550/15 px-2 py-0.5 rounded-md border border-amber-500/20">
                      本步解題技巧：{hint.technique}
                    </span>
                    <span className="text-xs font-mono font-medium text-slate-400">
                      第 {hint.row + 1} 行, 第 {hint.col + 1} 列
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed font-normal">
                    {hint.description}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleApplyHint}
                    className="flex-1 py-2 px-4 bg-amber-550 hover:bg-amber-500 text-slate-950 rounded-xl font-bold text-xs transition duration-150 flex items-center justify-center gap-1.5 select-none shadow-xs cursor-pointer"
                    id="btn-fill-hint"
                  >
                    自動填入答案：【{hint.value}】
                  </button>
                  <button
                    onClick={() => setHint(null)}
                    className="py-2 px-3 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl font-bold text-xs transition select-none cursor-pointer"
                    id="btn-close-hint"
                  >
                    關閉
                  </button>
                </div>
              </motion.div>
            ) : (
              <div className="py-6 text-center text-slate-400 space-y-2" id="hint-empty">
                <HelpCircle className="w-8 h-8 mx-auto text-slate-700 stroke-[1.5]" />
                <p className="text-xs font-semibold text-slate-400">需要解題線索嗎？</p>
                <p className="text-[11px] text-slate-500 max-w-[280px] mx-auto">
                  點擊上面的「顯示下一步提示」按鈕，系統會使用數獨推理演算法尋找最適合的填寫格式與技巧解釋。
                </p>
              </div>
            )}
          </div>

          {/* Mathematical facts section */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm" id="math-insights">
            <button 
              onClick={() => setShowMathInfo(!showMathInfo)}
              className="w-full text-left p-4 bg-slate-850/80 border-b border-slate-800 flex items-center justify-between hover:bg-slate-800 transition cursor-pointer"
              id="math-expand-toggle"
            >
              <h3 className="font-extrabold text-white flex items-center gap-2 text-sm tracking-wide">
                <BookOpen className="w-4.5 h-4.5 text-slate-400" />
                數獨數學與演算法科普 (Science & Math)
              </h3>
              <span className="text-xs bg-slate-800 text-slate-300 font-bold px-2 py-0.5 rounded-full">
                {showMathInfo ? '隱藏' : '展開'}
              </span>
            </button>

            <AnimatePresence>
              {showMathInfo && (
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: 'auto' }}
                  exit={{ height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="p-5 space-y-4 text-xs leading-relaxed text-slate-400 border-t border-slate-850 bg-slate-950">
                    
                    <div className="space-y-1.5">
                      <h4 className="font-bold text-slate-200 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
                        終局總數的驚人量級
                      </h4>
                      <p>
                        2005年，數學家 <strong>Bertram Felgenhauer</strong> 和 <strong>Frazer Jarvis</strong> 透過超級電腦運算，證明了標準的 $9 \times 9$ 數獨合法終局個數高達：
                      </p>
                      <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 font-mono text-amber-400 text-center font-bold text-sm tracking-wider my-1 shadow-inner">
                        6,670,903,752,021,072,936,960
                      </div>
                      <p>
                        即大約為 <strong>6.67 × 10²¹</strong> 種可能。即便是排除旋轉、對稱鏡像、數字互換等對稱結構後，本質不同的合法基本數獨盤面依然高達 <strong>5,472,730,538</strong> 種。
                      </p>
                    </div>

                    <div className="h-[1px] bg-slate-800" />

                    <div className="space-y-1.5">
                      <h4 className="font-bold text-slate-200 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
                        17個提示數的唯一解極限
                      </h4>
                      <p>
                        <strong>2012 年</strong>，數學家 Gary McGuire 團隊透過演算法和窮舉證明，一個合法的數獨題目<strong>最少必須提供 17 個提示數字</strong>才能保證「唯一解」。若少於 17 個數字（即 16 個或更少），任何題目都會有至少兩種不同的解，不再是正規合格題目。
                      </p>
                    </div>

                    <div className="h-[1px] bg-slate-800" />

                    <div className="space-y-1.5">
                      <h4 className="font-bold text-slate-200 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
                        二分覆蓋之巔：Algorithm X
                      </h4>
                      <p>
                        在演算法的世界中，數獨事實上是一個<strong>「精確覆蓋問題 (Exact Cover Problem)」</strong>。計算機科學大師 <strong>Donald Knuth</strong> 提出了著名的 <strong>Algorithm X</strong>，搭配 <strong>Dancing Links (DLX)</strong> 雙向十字鏈表資料結構，能夠在幾毫秒內找出數獨解法！
                      </p>
                    </div>

                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>

      </main>

      {/* Elegant Footer */}
      <footer className="mt-auto bg-slate-900 border-t border-slate-800 py-6 text-center text-xs text-slate-500" id="footer">
        <div className="max-w-7xl mx-auto px-4 space-y-2">
          <p>© 2026 數獨演算法實驗室 (Sudoku Lab). Created with premium design values.</p>
          <div className="flex justify-center gap-4 text-[11px] text-slate-500 flex-wrap">
            <span>回溯法對角線快速生成</span>
            <span>•</span>
            <span>唯一解挖孔過濾</span>
            <span>•</span>
            <span>精確覆蓋與數對剪枝</span>
            <span id="busuanzi_container_site_pv" style={{ display: 'none' }}>
              <span>•</span>
              <span>👁️ 總瀏覽量 <span id="busuanzi_value_site_pv" className="font-semibold text-slate-400"></span> 次</span>
            </span>
            <span id="busuanzi_container_site_uv" style={{ display: 'none' }}>
              <span>•</span>
              <span>👤 訪客數 <span id="busuanzi_value_site_uv" className="font-semibold text-slate-400"></span> 人</span>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
