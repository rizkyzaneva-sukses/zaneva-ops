const fs = require('fs');
const path = require('path');

const files = [
  'src/app/api/vendors/[id]/route.ts',
  'src/app/api/users/[id]/route.ts',
  'src/app/api/scan/[id]/commit/route.ts',
  'src/app/api/products/[id]/route.ts',
  'src/app/api/opname/[id]/commit/route.ts'
];

for (const file of files) {
  const fullPath = path.join(__dirname, file);
  let content = fs.readFileSync(fullPath, 'utf8');
  
  // replace { params }: { params: { id: string } } with { params }: { params: Promise<{ id: string }> }
  content = content.replace(/{ params }:\s*{ params: { id: string } }/g, '{ params }: { params: Promise<{ id: string }> }');
  
  // replace params.id with (await params).id
  content = content.replace(/params\.id/g, '(await params).id');
  
  fs.writeFileSync(fullPath, content);
}
console.log('Fixed');
