/**
 * The prefix a formula uses to reach another worksheet: `'כתב כמויות'!`. Always quoted, with any
 * apostrophe in the name doubled, as Excel requires. Build cross-sheet references only through this,
 * from the same constant the worksheet was created with, so a renamed sheet can never leave a formula
 * pointing at a sheet that does not exist (#REF!).
 */
export function sheetRef(sheetName: string): string {
  return `'${sheetName.replace(/'/g, "''")}'!`;
}
