/**
 * Sudoku Generator, Solver, and Hint Engine
 * Featuring backtracking, uniqueness checks, candidate tracking, and logical hint analysis
 */

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Cell {
  row: number;
  col: number;
  value: number;       // 0 for empty, 1-9 for filled
  original: boolean;   // true if generated as part of the initial puzzle
  candidates: number[]; // possible numbers according to Sudoku rules
  pencilMarks: number[]; // user-drawn notes
}

export type SudokuGrid = Cell[][];

// Helper to check safety
export function isSafe(grid: number[][], row: number, col: number, num: number): boolean {
  // Check row
  for (let x = 0; x < 9; x++) {
    if (grid[row][x] === num) return false;
  }

  // Check column
  for (let x = 0; x < 9; x++) {
    if (grid[x][col] === num) return false;
  }

  // Check 3x3 box
  const startRow = row - (row % 3);
  const startCol = col - (col % 3);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (grid[i + startRow][j + startCol] === num) return false;
    }
  }

  return true;
}

// Check safety in a 3x3 box specifically
function fillBox(grid: number[][], row: number, col: number) {
  const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  // Shuffle nums
  for (let i = nums.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [nums[i], nums[j]] = [nums[j], nums[i]];
  }

  let index = 0;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      grid[row + i][col + j] = nums[index++];
    }
  }
}

// Generate valid grid using Backtracking & Diagonal optimization
export function generateFullGrid(): number[][] {
  const grid: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));

  // Fill diagonal 3x3 boxes (which are independent of each other)
  fillBox(grid, 0, 0);
  fillBox(grid, 3, 3);
  fillBox(grid, 6, 6);

  // Fill the rest with backtracking helper
  fillRemaining(grid, 0, 3);

  return grid;
}

function fillRemaining(grid: number[][], i: number, j: number): boolean {
  if (j >= 9 && i < 8) {
    i = i + 1;
    j = 0;
  }
  if (i >= 9 && j >= 9) {
    return true;
  }

  if (i < 3) {
    if (j < 3) j = 3;
  } else if (i < 6) {
    if (j === Math.floor(i / 3) * 3) {
      j = j + 3;
    }
  } else {
    if (j === 6) {
      i = i + 1;
      j = 0;
      if (i >= 9) return true;
    }
  }

  for (let num = 1; num <= 9; num++) {
    // We shuffle tries to introduce randomness
    const randomNum = num; // Can be randomized but keeping simple loop shuffled or just serial works because box filling already randomizes
  }

  // To maintain proper randomness, we can shuffle 1-9 for each cell
  const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let k = numbers.length - 1; k > 0; k--) {
    const r = Math.floor(Math.random() * (k + 1));
    [numbers[k], numbers[r]] = [numbers[r], numbers[k]];
  }

  for (let idx = 0; idx < 9; idx++) {
    const num = numbers[idx];
    if (isSafe(grid, i, j, num)) {
      grid[i][j] = num;
      if (fillRemaining(grid, i, j + 1)) {
        return true;
      }
      grid[i][j] = 0;
    }
  }

  return false;
}

// Solve Sudoku & count solutions to verify uniqueness
export function solveSudoku(grid: number[][], limit = 2): { solutionsCount: number; solution: number[][] | null } {
  let solutionsCount = 0;
  let firstSolution: number[][] | null = null;

  function backtrack(g: number[][], r: number, c: number): boolean {
    if (r === 9) {
      solutionsCount++;
      if (!firstSolution) {
        firstSolution = g.map(row => [...row]);
      }
      return solutionsCount >= limit; // stop if we exceed limit
    }

    const nextR = c === 8 ? r + 1 : r;
    const nextC = c === 8 ? 0 : c + 1;

    if (g[r][c] !== 0) {
      return backtrack(g, nextR, nextC);
    }

    for (let num = 1; num <= 9; num++) {
      if (isSafe(g, r, c, num)) {
        g[r][c] = num;
        if (backtrack(g, nextR, nextC)) {
          return true;
        }
        g[r][c] = 0;
      }
    }

    return false;
  }

  const gridCopy = grid.map(row => [...row]);
  backtrack(gridCopy, 0, 0);

  return { solutionsCount, solution: firstSolution };
}

// Dig holes (remove items while maintaining uniqueness of solution)
// Easy: ~35-42 clues remaining
// Medium: ~28-34 clues remaining
// Hard: ~17-27 clues remaining (17 is mathematical minimum for unique solution)
export function digHoles(fullGrid: number[][], difficulty: Difficulty): number[][] {
  const grid = fullGrid.map(row => [...row]);
  
  // Create a list of all 81 positions
  const positions: [number, number][] = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      positions.push([r, c]);
    }
  }

  // Shuffle positions
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }

  let minClues = 35; // Easy
  if (difficulty === 'medium') minClues = 28;
  if (difficulty === 'hard') minClues = 17; // Minimum limit

  let cluesCount = 81;

  for (const [r, c] of positions) {
    if (cluesCount <= minClues) {
      break;
    }

    const val = grid[r][c];
    grid[r][c] = 0;
    cluesCount--;

    // Check if solution is still unique
    const { solutionsCount } = solveSudoku(grid, 2);
    if (solutionsCount !== 1) {
      // Put it back
      grid[r][c] = val;
      cluesCount++;
    }
  }

  return grid;
}

// Calculate correct rules-based candidates for empty cells
export function computeCandidates(grid: number[][], r: number, c: number): number[] {
  if (grid[r][c] !== 0) return [];
  const candidates: number[] = [];
  for (let val = 1; val <= 9; val++) {
    if (isSafe(grid, r, c, val)) {
      candidates.push(val);
    }
  }
  return candidates;
}

export interface HintResult {
  row: number;
  col: number;
  value: number;
  technique: string;
  description: string;
  highlightCells: [number, number][]; // cells to display differently
  affectedValue?: number;
}

// Look for logical steps to provide a hint
export function getNextStepHint(grid: number[][], solution: number[][]): HintResult | null {
  // Let's first build candidates for all cells
  const cellCandidates: number[][][] = Array.from({ length: 9 }, () => Array(9).fill(null));
  let emptyCount = 0;

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (grid[r][c] === 0) {
        cellCandidates[r][c] = computeCandidates(grid, r, c);
        emptyCount++;
      } else {
        cellCandidates[r][c] = [];
      }
    }
  }

  if (emptyCount === 0) {
    return null;
  }

  // 1. Naked Single (唯餘法 / 唯一候選數)
  // An empty cell has exactly one candidate.
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (grid[r][c] === 0) {
        const candidates = cellCandidates[r][c];
        if (candidates.length === 1) {
          const val = candidates[0];
          return {
            row: r,
            col: c,
            value: val,
            technique: '唯餘法 (Naked Single)',
            description: `第 ${r + 1} 行、第 ${c + 1} 列的格子只有一個合法的數字可填：【${val}】。這是因為同行、同列和同宮格已經填寫了其他 8 個數字。`,
            highlightCells: [[r, c]]
          };
        }
      }
    }
  }

  // 2. Hidden Single (排除法 / 隱性唯一數)
  // A number has only one candidate cell in a Row, Column, or 3x3 Box.
  // Check Rows
  for (let r = 0; r < 9; r++) {
    for (let val = 1; val <= 9; val++) {
      const positiveCells: [number, number][] = [];
      for (let c = 0; c < 9; c++) {
        if (grid[r][c] === 0 && cellCandidates[r][c].includes(val)) {
          positiveCells.push([r, c]);
        }
      }
      if (positiveCells.length === 1) {
        const [hr, hc] = positiveCells[0];
        return {
          row: hr,
          col: hc,
          value: val,
          technique: '行排除法 (Hidden Single in Row)',
          description: `在第 ${r + 1} 行中，數字 【${val}】 只能填入第 ${hc + 1} 列。該行的其餘位置都不適合填入 ${val}。`,
          highlightCells: [[hr, hc]]
        };
      }
    }
  }

  // Check Columns
  for (let c = 0; c < 9; c++) {
    for (let val = 1; val <= 9; val++) {
      const positiveCells: [number, number][] = [];
      for (let r = 0; r < 9; r++) {
        if (grid[r][c] === 0 && cellCandidates[r][c].includes(val)) {
          positiveCells.push([r, r]); // Keep track of coordinates
          positiveCells[positiveCells.length - 1] = [r, c];
        }
      }
      if (positiveCells.length === 1) {
        const [hr, hc] = positiveCells[0];
        return {
          row: hr,
          col: hc,
          value: val,
          technique: '列排除法 (Hidden Single in Column)',
          description: `在第 ${hc + 1} 列中，數字 【${val}】 只能填入第 ${hr + 1} 行。該列的其餘位置都不能填入 ${val}。`,
          highlightCells: [[hr, hc]]
        };
      }
    }
  }

  // Check 3x3 Boxes
  for (let box = 0; box < 9; box++) {
    const startRow = Math.floor(box / 3) * 3;
    const startCol = (box % 3) * 3;

    for (let val = 1; val <= 9; val++) {
      const positiveCells: [number, number][] = [];
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const r = startRow + i;
          const c = startCol + j;
          if (grid[r][c] === 0 && cellCandidates[r][c].includes(val)) {
            positiveCells.push([r, c]);
          }
        }
      }
      if (positiveCells.length === 1) {
        const [hr, hc] = positiveCells[0];
        const boxIndex = box + 1;
        return {
          row: hr,
          col: hc,
          value: val,
          technique: '宮排除法 (Hidden Single in Box)',
          description: `在第 ${boxIndex} 宮中，數字 【${val}】 只能填在第 ${hr + 1} 行、第 ${hc + 1} 列。此宮其餘位置均無 ${val} 空間。`,
          highlightCells: [[hr, hc]]
        };
      }
    }
  }

  // 3. Naked Pair (顯性數對)
  // Two cells in a row/col/box have exactly two identical candidates.
  // Let's identify such pair and offer elimination advice or fill one of them
  for (let r = 0; r < 9; r++) {
    for (let c1 = 0; c1 < 8; c1++) {
      if (grid[r][c1] === 0 && cellCandidates[r][c1].length === 2) {
        for (let c2 = c1 + 1; c2 < 9; c2++) {
          if (grid[r][c2] === 0 && cellCandidates[r][c2].length === 2) {
            const cand1 = cellCandidates[r][c1];
            const cand2 = cellCandidates[r][c2];
            if (cand1[0] === cand2[0] && cand1[1] === cand2[1]) {
              // Found naked pair in row!
              // Suggest completing one of the actual cells with solution to advance
              const correctVal = solution[r][c1];
              return {
                row: r,
                col: c1,
                value: correctVal,
                technique: '顯性數對 (Naked Pair in Row)',
                description: `第 ${r + 1} 行的第 ${c1 + 1} 列及第 ${c2 + 1} 列構成了顯性數對 [${cand1.join(', ')}]。因此這二者必填寫這兩個數，我們可以填入正確答案【${correctVal}】。`,
                highlightCells: [[r, c1], [r, c2]]
              };
            }
          }
        }
      }
    }
  }

  // 4. Default: Return first empty cell with correct solution value
  // This acts as general backtracking-based assistance
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (grid[r][c] === 0) {
        const correctVal = solution[r][c];
        return {
          row: r,
          col: c,
          value: correctVal,
          technique: '回溯解析 / 基礎排除 (Backtracking Insight)',
          description: `根據全面規則排除，第 ${r + 1} 行、第 ${c + 1} 列最適合填寫 【${correctVal}】。`,
          highlightCells: [[r, c]]
        };
      }
    }
  }

  return null;
}
