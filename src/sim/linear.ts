/** Dense Gaussian elimination with pivoting. No artificial conductance or guessed solution. */
export function solveLinear(matrix: readonly Float64Array[], rhs: Float64Array): Float64Array | 'inconsistent' | 'underdetermined' {
  const size = rhs.length;
  const rows: Float64Array[] = matrix.map((row, index) => {
    const result = new Float64Array(size + 1);
    result.set(row);
    result[size] = rhs[index] ?? 0;
    return result;
  });
  const rowAt = (index: number): Float64Array => {
    const row = rows[index];
    if (!row) throw new Error('linear-index');
    return row;
  };
  let rank = 0;
  for (let column = 0; column < size; column++) {
    let pivot = rank;
    for (let index = rank + 1; index < size; index++)
      if (Math.abs(rowAt(index)[column] ?? 0) > Math.abs(rowAt(pivot)[column] ?? 0)) pivot = index;
    const scale = Math.max(...rowAt(pivot).subarray(0, size).map(Math.abs));
    if (!Number.isFinite(scale)) return 'inconsistent';
    if (Math.abs(rowAt(pivot)[column] ?? 0) <= Math.max(1e-14, scale * 1e-12)) continue;
    const previous = rowAt(rank);
    rows[rank] = rowAt(pivot);
    rows[pivot] = previous;
    const leading = rowAt(rank);
    for (let index = rank + 1; index < size; index++) {
      const target = rowAt(index);
      const factor = (target[column] ?? 0) / (leading[column] ?? 1);
      for (let j = column; j <= size; j++) target[j] = (target[j] ?? 0) - factor * (leading[j] ?? 0);
    }
    rank++;
  }
  if (rank < size) {
    for (let row = rank; row < size; row++) if (Math.abs(rowAt(row)[size] ?? 0) > 1e-8) return 'inconsistent';
    return 'underdetermined';
  }
  const solution = new Float64Array(size);
  for (let index = size - 1; index >= 0; index--) {
    const row = rowAt(index);
    let sum = row[size] ?? 0;
    for (let j = index + 1; j < size; j++) sum -= (row[j] ?? 0) * (solution[j] ?? 0);
    solution[index] = sum / (row[index] ?? 1);
    if (!Number.isFinite(solution[index])) return 'inconsistent';
  }
  // A scale-aware residual check rejects numerically unreliable answers.
  for (let index = 0; index < size; index++) {
    const row = matrix[index];
    if (!row) return 'inconsistent';
    let sum = 0;
    let magnitude = Math.abs(rhs[index] ?? 0);
    for (let j = 0; j < size; j++) {
      const term = (row[j] ?? 0) * (solution[j] ?? 0);
      sum += term;
      magnitude += Math.abs(term);
    }
    if (Math.abs(sum - (rhs[index] ?? 0)) > 1e-8 * Math.max(1, magnitude)) return 'inconsistent';
  }
  return solution;
}
