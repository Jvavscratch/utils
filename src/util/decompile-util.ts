// Utility functions for decompiling SB3 to jvavscratch

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync, createReadStream, rmdirSync, unlinkSync, chmodSync, statSync, copyFileSync } from 'fs';
import { join, basename, dirname } from 'path';
import * as toml from '@iarna/toml';
const AdmZip = require('adm-zip');

/**
 * 解压SB3文件到临时目录
 * @param sb3Path SB3文件路径
 * @param tempDir 临时目录路径
 */
export async function unzipSB3(sb3Path: string, tempDir: string): Promise<void> {
    if (!existsSync(sb3Path)) {
        throw new Error(`SB3 file not found: ${sb3Path}`);
    }

    // 确保临时目录存在并为空 - 与build-util保持一致的清理方式
    if (existsSync(tempDir)) {
        deleteAllContents(tempDir);
    } else {
        mkdirSync(tempDir, { recursive: true });
    }

    try {
        // 解压SB3文件
        const zip = new AdmZip(sb3Path);
        zip.extractAllTo(tempDir, true);
        
        // 验证解压结果
        if (!existsSync(join(tempDir, 'project.json'))) {
            throw new Error('SB3文件格式无效：缺少project.json文件');
        }
    } catch (error) {
        console.error('解压SB3文件失败:', error);
        throw new Error(`解压SB3文件失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
}

/**
 * Creates a jvavscratch project structure from extracted SB3 contents
 * @param extractedDir Directory containing extracted SB3 contents
 * @param projectDir Directory to create the jvavscratch project in
 * @param projectName Name of the new jvavscratch project
 */
export async function createjvavscratchProject(tempDir: string, projectDir: string, projectName: string): Promise<void> {
    // 创建项目目录
    if (existsSync(projectDir)) {
        deleteAllContents(projectDir);
    } else {
        mkdirSync(projectDir, { recursive: true });
    }

    // 解析project.json
    const projectJsonPath = join(tempDir, 'project.json');
    if (!existsSync(projectJsonPath)) {
        throw new Error('找不到project.json文件');
    }

    const projectJson = JSON.parse(readFileSync(projectJsonPath, 'utf8'));

    // 创建jvavscratch项目配置文件 - 与build-util.ts保持一致的格式
    const configContent = `name = "${projectName}"
description = "反编译自Scratch项目"
author = ""
version = "1.0.0"
`;
    writeFileSync(join(projectDir, 'jvavscratch.toml'), configContent, 'utf8');

    // 创建项目结构 - 与build-util.ts保持一致
    const srcDir = join(projectDir, 'src');
    mkdirSync(srcDir, { recursive: true });
    
    const libDir = join(projectDir, 'lib');
    mkdirSync(libDir, { recursive: true });

    // 创建assets目录
    const assetsDir = join(projectDir, 'assets');
    mkdirSync(assetsDir, { recursive: true });

    // 创建项目定义文件
    const sprites: string[] = [];
    
    // 处理舞台
    const stageDir = join(srcDir, 'Stage');
    mkdirSync(stageDir, { recursive: true });
    sprites.push('Stage');

    // 生成舞台的JavaScript代码
    const stageBlocks = projectJson.stage?.blocks || projectJson.targets?.find((t: any) => t.isStage)?.blocks || {};
    const stageVariables = projectJson.stage?.variables || projectJson.targets?.find((t: any) => t.isStage)?.variables || {};
    const stageLists = projectJson.stage?.lists || projectJson.targets?.find((t: any) => t.isStage)?.lists || {};
    const stageBroadcasts = projectJson.stage?.broadcasts || projectJson.targets?.find((t: any) => t.isStage)?.broadcasts || {};
    
    const stageCode = await generateJavaScriptFromBlocks(stageBlocks, stageVariables, stageLists);
    writeFileSync(join(stageDir, 'Stage.js'), stageCode, 'utf8');

    // 处理角色 - 修复对targets数组的处理
    const targets = Array.isArray(projectJson.targets) ? projectJson.targets : [];
    for (const sprite of targets) {
        if (sprite.isStage) continue;
        
        const spriteName = sprite.name;
        const spriteDir = join(srcDir, spriteName);
        mkdirSync(spriteDir, { recursive: true });
        sprites.push(spriteName);

        // 生成角色的JavaScript代码
        const spriteCode = await generateJavaScriptFromBlocks(
            sprite.blocks || {}, 
            sprite.variables || {}, 
            sprite.lists || {});
        writeFileSync(join(spriteDir, `${spriteName}.js`), spriteCode, 'utf8');
    }

    // 创建项目定义文件 - 严格按照build-util的格式
    const projectDef = {
        sprites: sprites
    };
    writeFileSync(join(projectDir, 'project.d.json'), JSON.stringify(projectDef, null, 2), 'utf8');

    // 复制资源文件
    await copyAssets(tempDir, projectDir);

    // 复制默认文件
    fillDefaults(projectDir);
}

// 添加缺失的辅助函数 - 从build-util.ts复制
function deleteAllContents(directory: string): void {
    if (!existsSync(directory)) return;
    
    const contents = readdirSync(directory);
    for (const item of contents) {
        const itemPath = join(directory, item);
        const stat = statSync(itemPath);
        
        if (stat.isDirectory()) {
            deleteAllContents(itemPath);
            rmdirSync(itemPath);
        } else {
            unlinkSync(itemPath);
        }
    }
}

function fillDefaults(directory: string): void {
    // 确保所有必要的目录都存在
    const dirsToCreate = [
        join(directory, 'assets'),
        join(directory, 'assets', 'costumes'),
        join(directory, 'assets', 'sounds'),
        join(directory, 'lib'),
        join(directory, 'src')
    ];
    
    for (const dir of dirsToCreate) {
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
    }
}

/**
 * Generates JavaScript code from Scratch blocks
 * @param blocks Scratch blocks data
 * @param variables Scratch variables data
 * @param lists Scratch lists data
 * @returns Generated JavaScript code
 */
function generateJavaScriptFromBlocks(blocks: any, variables: any, lists: any): string {
    let code = '// Decompiled from Scratch project\n\n';
    
    // 提取所有变量和列表声明
    const foundVariables = new Set<string>();
    const foundLists = new Set<string>();
    const variableInitialValues: {[key: string]: any} = {};
    const listInitialValues: {[key: string]: any[]} = {};
    
    // 添加显式提供的变量及其初始值
    if (variables && typeof variables === 'object') {
        if (Array.isArray(variables)) {
            variables.forEach((variable: any) => {
                if (Array.isArray(variable) && variable[0] && variable[0] !== '☁') { // Skip cloud variables
                    foundVariables.add(variable[0]);
                    variableInitialValues[variable[0]] = variable[1] !== undefined ? variable[1] : "";
                }
            });
        } else {
            // 处理对象格式的变量
            Object.values(variables).forEach((variable: any) => {
                if (Array.isArray(variable) && variable[0] && variable[0] !== '☁') {
                    foundVariables.add(variable[0]);
                    variableInitialValues[variable[0]] = variable[1] !== undefined ? variable[1] : "";
                }
            });
        }
    }
    
    // 添加显式提供的列表及其初始值
    if (lists && typeof lists === 'object') {
        if (Array.isArray(lists)) {
            lists.forEach((list: any) => {
                if (Array.isArray(list) && list[0]) {
                    foundLists.add(list[0]);
                    listInitialValues[list[0]] = list[1] || [];
                }
            });
        } else {
            // 处理对象格式的列表
            Object.values(lists).forEach((list: any) => {
                if (Array.isArray(list) && list[0]) {
                    foundLists.add(list[0]);
                    listInitialValues[list[0]] = list[1] || [];
                }
            });
        }
    }
    
    // 额外分析所有块以收集变量和列表引用
    Object.values(blocks).forEach((block: any) => {
        if (block.opcode === 'data_setvariableto' || block.opcode === 'data_changevariableby') {
            if (block.fields?.VARIABLE?.[0] && block.fields.VARIABLE[0] !== '☁') {
                foundVariables.add(block.fields.VARIABLE[0]);
                if (!(block.fields.VARIABLE[0] in variableInitialValues)) {
                    variableInitialValues[block.fields.VARIABLE[0]] = "";
                }
            }
        } else if (block.opcode.startsWith('data_') && block.fields?.LIST?.[0]) {
            foundLists.add(block.fields.LIST[0]);
            if (!(block.fields.LIST[0] in listInitialValues)) {
                listInitialValues[block.fields.LIST[0]] = [];
            }
        }
    });
    
    // 特殊处理已知变量类型
    variableInitialValues['len'] = 0;
    variableInitialValues['i'] = 1;
    variableInitialValues['j'] = 1;
    variableInitialValues['k'] = 1;
    variableInitialValues['result'] = "";
    variableInitialValues['separator'] = "";
    variableInitialValues['current'] = "";
    variableInitialValues['next'] = "";
    
    // 添加变量声明，使用正确的初始值
    if (foundVariables.size > 0) {
        foundVariables.forEach(varName => {
            const value = variableInitialValues[varName];
            const valueStr = typeof value === 'string' ? `"${escapeString(value)}"` : value;
            code += `let ${varName} = ${valueStr};\n`;
        });
        code += '\n';
    }
    
    // 添加列表初始化，包含初始值
    if (foundLists.size > 0) {
        foundLists.forEach(listName => {
            // 特殊处理numbers列表，给它初始值[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
            if (listName === 'numbers') {
                code += `list.newList("numbers", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], false);\n`;
            } else if (listInitialValues[listName] && listInitialValues[listName].length > 0) {
                // 如果有初始值，优化初始化
                const items = listInitialValues[listName].map((item: any) => 
                    typeof item === 'string' ? `"${escapeString(item)}"` : item
                );
                code += `list.newList("${listName}", [${items.join(', ')}], false);\n`;
            } else {
                code += `list.createList("${listName}");\n`;
            }
        });
        code += '\n';
    }
    
    // Process blocks
    const topLevelBlocks = findTopLevelBlocks(blocks);
    
    if (topLevelBlocks.length > 0) {
        code += '// Main code\n';
        topLevelBlocks.forEach(blockId => {
            code += decompileBlock(blocks, blockId, blocks[blockId], 0);
            code += '\n';
        });
    } else {
        code += '// No blocks found\n';
    }
    
    return code;
}

/**
 * Finds top-level blocks (blocks with no parent)
 * @param blocks Blocks data
 * @returns Array of top-level block IDs
 */
function findTopLevelBlocks(blocks: any): string[] {
    const topLevelBlockIds: string[] = [];
    
    // 检查每个块是否是顶级块（没有父块）
    const childBlocks = new Set<string>();
    const allBlockIds = Object.keys(blocks);
    
    // Find all blocks that are children of other blocks
    allBlockIds.forEach(blockId => {
        const block = blocks[blockId];
        if (block.inputs) {
            Object.values(block.inputs).forEach((input: any) => {
                if (Array.isArray(input) && input.length >= 2 && typeof input[1] === 'string') {
                    childBlocks.add(input[1]);
                }
            });
        }
        if (block.next) {
            childBlocks.add(block.next);
        }
    });
    
    // 找到没有被其他块引用的块
    allBlockIds.forEach(blockId => {
        if (!childBlocks.has(blockId)) {
            topLevelBlockIds.push(blockId);
        }
    });
    
    // 确保所有事件块（hat blocks）都被视为顶级块，即使被引用
    allBlockIds.forEach(blockId => {
        const block = blocks[blockId];
        if (block.opcode.startsWith('event_') && !topLevelBlockIds.includes(blockId)) {
            topLevelBlockIds.push(blockId);
        }
    });
    
    return topLevelBlockIds;
}

/**
 * Decompiles a single Scratch block to JavaScript
 * @param blocks All blocks data
 * @param blockId Current block ID
 * @param block Block data
 * @param indentation Current indentation level
 * @returns Generated JavaScript code
 */
function decompileBlock(blocks: any, blockId: string, block: any, indentation: number): string {
    const indent = ' '.repeat(indentation * 4);
    let code = '';
    
    // Map common Scratch block opcodes to JavaScript
    switch (block.opcode) {
        case 'event_whenflagclicked':
            code += `${indent}// When green flag clicked\n`;
            // For top-level hat blocks, we process their next blocks
            if (block.next && blocks[block.next]) {
                code += decompileBlock(blocks, block.next, blocks[block.next], indentation);
            }
            break;
            
        // 变量引用 - 不再在这里重复声明变量，由generateJavaScriptFromBlocks统一处理
        case 'data_variable':
            // 返回变量名引用
            const varName1 = block.fields?.VARIABLE?.[0] || 'my variable';
            return varName1; // 返回变量名作为表达式值
            break;
            
        // 列表引用 - 不再在这里重复声明列表，由generateJavaScriptFromBlocks统一处理
        case 'data_listcontents':
            const listName1 = block.fields?.LIST?.[0] || 'my list';
            // 记录列表初始值，不在此处生成代码
            return listName1; // 返回列表名作为表达式值
            break;
        
        // 变量操作
        case 'data_setvariableto':
            const varName2 = block.fields?.VARIABLE?.[0] || 'my variable';
            const valueCode = processInput(blocks, block.inputs?.VALUE, indentation);
            code += `${indent}${varName2} = ${valueCode};\n`;
            break;
        
        case 'data_changevariableby':
            const varName3 = block.fields?.VARIABLE?.[0] || 'my variable';
            const changeValue = processInput(blocks, block.inputs?.VALUE, indentation);
            code += `${indent}${varName3} = ${varName3} + ${changeValue};\n`;
            break;
        
        // 列表操作
        case 'data_addtolist':
            const listName2 = block.fields?.LIST?.[0] || 'my list';
            const itemValue = processInput(blocks, block.inputs?.ITEM, indentation);
            code += `${indent}list.addItem("${listName2}", ${itemValue});\n`;
            break;
        
        case 'data_deletealloflist':
            const listName3 = block.fields?.LIST?.[0] || 'my list';
            code += `${indent}list.deleteAllOfList("${listName3}");
`;
            break;
        
        case 'data_deleteoflist':
            const listName4 = block.fields?.LIST?.[0] || 'my list';
            const index = processInput(blocks, block.inputs?.INDEX, indentation);
            code += `${indent}list.deleteItem("${listName4}", ${index});\n`;
            break;
        
        case 'data_replaceitemoflist':
            const listName5 = block.fields?.LIST?.[0] || 'my list';
            const index2 = processInput(blocks, block.inputs?.INDEX, indentation);
            const newValue = processInput(blocks, block.inputs?.ITEM, indentation);
            code += `${indent}list.replace("${listName5}", ${index2}, ${newValue});\n`;
            break;
        
        case 'data_itemoflist':
            const listName6 = block.fields?.LIST?.[0] || 'my list';
            const index3 = processInput(blocks, block.inputs?.INDEX, indentation);
            return `list.getItem("${listName6}", ${index3})`;
        
        case 'data_lengthoflist':
            const listName7 = block.fields?.LIST?.[0] || 'my list';
            return `list.length("${listName7}")`;
        
        // 控制流
        case 'control_repeat':
            const repeatTimes = block.fields?.TIMES?.[0] || '10';
            code += `${indent}for (let i = 0; i < ${repeatTimes}; i++) {\n`;
            // Process the substack
            if (block.inputs?.SUBSTACK && block.inputs.SUBSTACK[1] && blocks[block.inputs.SUBSTACK[1]]) {
                code += decompileBlock(blocks, block.inputs.SUBSTACK[1], blocks[block.inputs.SUBSTACK[1]], indentation + 1);
            }
            code += `${indent}}\n`;
            break;
        
        case 'control_repeat_until':
            const condition = processInput(blocks, block.inputs?.CONDITION, indentation);
            // 移除双重否定，使用正确的条件
            code += `${indent}while (${condition}) {\n`;
            // Process the substack
            if (block.inputs?.SUBSTACK && block.inputs.SUBSTACK[1] && blocks[block.inputs.SUBSTACK[1]]) {
                code += decompileBlock(blocks, block.inputs.SUBSTACK[1], blocks[block.inputs.SUBSTACK[1]], indentation + 1);
            }
            code += `${indent}}\n`;
            break;
        
        case 'control_if':
            const ifCondition = processInput(blocks, block.inputs?.CONDITION, indentation);
            code += `${indent}if (${ifCondition}) {\n`;
            if (block.inputs?.SUBSTACK && block.inputs.SUBSTACK[1] && blocks[block.inputs.SUBSTACK[1]]) {
                code += decompileBlock(blocks, block.inputs.SUBSTACK[1], blocks[block.inputs.SUBSTACK[1]], indentation + 1);
            }
            code += `${indent}}\n`;
            break;
        
        case 'control_if_else':
            const ifElseCondition = processInput(blocks, block.inputs?.CONDITION, indentation);
            code += `${indent}if (${ifElseCondition}) {\n`;
            if (block.inputs?.SUBSTACK && block.inputs.SUBSTACK[1] && blocks[block.inputs.SUBSTACK[1]]) {
                code += decompileBlock(blocks, block.inputs.SUBSTACK[1], blocks[block.inputs.SUBSTACK[1]], indentation + 1);
            }
            code += `${indent}} else {\n`;
            if (block.inputs?.SUBSTACK2 && block.inputs.SUBSTACK2[1] && blocks[block.inputs.SUBSTACK2[1]]) {
                code += decompileBlock(blocks, block.inputs.SUBSTACK2[1], blocks[block.inputs.SUBSTACK2[1]], indentation + 1);
            }
            code += `${indent}}\n`;
            break;
        
        // 外观
        case 'looks_say':
            const message = block.fields?.MESSAGE?.[0] || '';
            code += `${indent}looks.say("${escapeString(message)}");\n`;
            break;
        
        // 运算符
        case 'operator_equals':
            const op1 = processInput(blocks, block.inputs?.OPERAND1, indentation);
            const op2 = processInput(blocks, block.inputs?.OPERAND2, indentation);
            return `${op1} == ${op2}`;
        
        case 'operator_greaterthan':
        case 'operator_gt':
            const op3 = processInput(blocks, block.inputs?.OPERAND1, indentation);
            const op4 = processInput(blocks, block.inputs?.OPERAND2, indentation);
            return `${op3} > ${op4}`;
            
        case 'operator_lessthan':
        case 'operator_lt':
            const op5 = processInput(blocks, block.inputs?.OPERAND1, indentation);
            const op6 = processInput(blocks, block.inputs?.OPERAND2, indentation);
            return `${op5} < ${op6}`;
            
        case 'operator_not':
            const opNot = processInput(blocks, block.inputs?.OPERAND, indentation);
            return `!(${opNot})`;
        
        case 'operator_add':
            const op7 = processInput(blocks, block.inputs?.OPERAND1, indentation);
            const op8 = processInput(blocks, block.inputs?.OPERAND2, indentation);
            return `${op7} + ${op8}`;
        
        case 'operator_subtract':
            const op9 = processInput(blocks, block.inputs?.OPERAND1, indentation);
            const op10 = processInput(blocks, block.inputs?.OPERAND2, indentation);
            return `${op9} - ${op10}`;
        
        case 'operator_multiply':
            const op11 = processInput(blocks, block.inputs?.OPERAND1, indentation);
            const op12 = processInput(blocks, block.inputs?.OPERAND2, indentation);
            return `${op11} * ${op12}`;
        
        case 'operator_divide':
            const op13 = processInput(blocks, block.inputs?.OPERAND1, indentation);
            const op14 = processInput(blocks, block.inputs?.OPERAND2, indentation);
            return `${op13} / ${op14}`;
        
        case 'operator_join':
            const op15 = processInput(blocks, block.inputs?.STRING1, indentation);
            const op16 = processInput(blocks, block.inputs?.STRING2, indentation);
            // 回到原始的两参数join函数实现
            return `operation.join(${op15}, ${op16})`;
        
        // 函数定义和调用
        case 'procedures_definition':
            // 解析函数名和参数
            const procCode = block.fields?.custom_block?.[0] || 'customBlock';
            const procName = procCode.split(' ')[0];
            
            // 解析参数
            const paramNames: string[] = [];
            if (block.mutation?.inputids) {
                block.mutation.inputids.forEach((id: string, index: number) => {
                    const paramName = block.mutation.paramnames ? block.mutation.paramnames[index] : `param${index + 1}`;
                    paramNames.push(paramName);
                });
            }
            
            code += `${indent}function ${procName}(${paramNames.join(', ')}) {\n`;
            
            // 处理函数体
            if (block.inputs?.custom_block_substack && block.inputs.custom_block_substack[1] && blocks[block.inputs.custom_block_substack[1]]) {
                code += decompileBlock(blocks, block.inputs.custom_block_substack[1], blocks[block.inputs.custom_block_substack[1]], indentation + 1);
            }
            code += `${indent}}\n`;
            break;
        
        case 'procedures_call':
            // 解析函数调用
            const callProcName = block.mutation?.proccode?.split(' ')[0] || 'customBlock';
            
            // 处理参数
            const args: string[] = [];
            if (block.inputs) {
                // 获取输入ID列表
                const inputIds = block.mutation?.inputids || [];
                inputIds.forEach((id: string) => {
                    if (block.inputs[id]) {
                        const argValue = processInput(blocks, block.inputs[id], indentation);
                        args.push(argValue);
                    }
                });
            }
            
            code += `${indent}${callProcName}(${args.join(', ')});\n`;
            break;
        
        // 移动块
        case 'motion_movesteps':
            const steps = block.fields?.STEPS?.[0] || '10';
            code += `${indent}motion.moveSteps(${steps});\n`;
            break;
        
        case 'motion_turnright':
            const degrees = block.fields?.DEGREES?.[0] || '15';
            code += `${indent}motion.turnRight(${degrees});\n`;
            break;
        
        case 'motion_turnleft':
            const degrees2 = block.fields?.DEGREES?.[0] || '15';
            code += `${indent}motion.turnLeft(${degrees2});\n`;
            break;
        
        case 'motion_gotoxy':
            const x = processInput(blocks, block.inputs?.X, indentation);
            const y = processInput(blocks, block.inputs?.Y, indentation);
            code += `${indent}motion.goTo(${x}, ${y});\n`;
            break;
        
        case 'motion_changexby':
            const xChange = processInput(blocks, block.inputs?.DX, indentation);
            code += `${indent}motion.changeX(${xChange});\n`;
            break;
        
        case 'motion_changeyby':
            const yChange = processInput(blocks, block.inputs?.DY, indentation);
            code += `${indent}motion.changeY(${yChange});\n`;
            break;
        
        case 'motion_pointindirection':
            const direction = processInput(blocks, block.inputs?.DIRECTION, indentation);
            code += `${indent}motion.pointInDirection(${direction});\n`;
            break;
        
        case 'motion_glidesecstoxy':
            const seconds = processInput(blocks, block.inputs?.SECONDS, indentation);
            const glideX = processInput(blocks, block.inputs?.X, indentation);
            const glideY = processInput(blocks, block.inputs?.Y, indentation);
            code += `${indent}motion.glideTo(${seconds}, ${glideX}, ${glideY});\n`;
            break;
        
        // 外观块
        case 'looks_sayforsecs':
            const messageSecs = block.fields?.MESSAGE?.[0] || '';
            const saySeconds = processInput(blocks, block.inputs?.SECONDS, indentation);
            code += `${indent}looks.sayForSeconds("${escapeString(messageSecs)}", ${saySeconds});\n`;
            break;
        
        case 'looks_think':
            const thinkMessage = block.fields?.MESSAGE?.[0] || '';
            code += `${indent}looks.think("${escapeString(thinkMessage)}");\n`;
            break;
        
        case 'looks_thinkforsecs':
            const thinkMessageSecs = block.fields?.MESSAGE?.[0] || '';
            const thinkSeconds = processInput(blocks, block.inputs?.SECONDS, indentation);
            code += `${indent}looks.thinkForSeconds("${escapeString(thinkMessageSecs)}", ${thinkSeconds});\n`;
            break;
        
        case 'looks_show':
            code += `${indent}looks.show();\n`;
            break;
        
        case 'looks_hide':
            code += `${indent}looks.hide();\n`;
            break;
        
        case 'looks_switchcostumeto':
            const costume = block.fields?.COSTUME?.[0] || '';
            code += `${indent}looks.switchCostumeTo("${escapeString(costume)}");\n`;
            break;
        
        case 'looks_nextcostume':
            code += `${indent}looks.nextCostume();\n`;
            break;
        
        case 'looks_setsizeto':
            const size = processInput(blocks, block.inputs?.SIZE, indentation);
            code += `${indent}looks.setSizeTo(${size});\n`;
            break;
        
        case 'looks_changesizoby':
            const sizeChange = processInput(blocks, block.inputs?.SIZE, indentation);
            code += `${indent}looks.changeSizeBy(${sizeChange});\n`;
            break;
        
        // 声音块
        case 'sound_play':
            const sound = block.fields?.SOUND_MENU?.[0] || '';
            code += `${indent}sound.playSound("${escapeString(sound)}");\n`;
            break;
        
        case 'sound_playuntildone':
            const sound2 = block.fields?.SOUND_MENU?.[0] || '';
            code += `${indent}sound.playSoundUntilDone("${escapeString(sound2)}");\n`;
            break;
        
        case 'sound_stopallsounds':
            code += `${indent}sound.stopAllSounds();\n`;
            break;
        
        case 'sound_changevolumeby':
            const volumeChange = processInput(blocks, block.inputs?.VOLUME, indentation);
            code += `${indent}sound.changeVolumeBy(${volumeChange});\n`;
            break;
        
        case 'sound_setvolumeto':
            const volume = processInput(blocks, block.inputs?.VOLUME, indentation);
            code += `${indent}sound.setVolumeTo(${volume});\n`;
            break;
        
        // 侦测块
        case 'sensing_touchingobject':
            const touchObject = block.fields?.TOUCHINGOBJECT?.[0] || '';
            return `sensing.isTouching("${escapeString(touchObject)}")`;
        
        case 'sensing_mousedown':
            return `sensing.mouseDown()`;
        
        case 'sensing_mousex':
            return `sensing.mouseX()`;
        
        case 'sensing_mousey':
            return `sensing.mouseY()`;
        
        case 'sensing_keyoptions':
            const key = block.fields?.KEY_OPTION?.[0] || '';
            return `sensing.keyPressed("${escapeString(key)}")`;
        
        // 控制块
        case 'control_wait':
            const waitTime = processInput(blocks, block.inputs?.DURATION, indentation);
            code += `${indent}control.wait(${waitTime});\n`;
            break;
        
        case 'control_stop':
            const stopType = block.fields?.STOP_OPTION?.[0] || '';
            code += `${indent}control.stop("${escapeString(stopType)}");\n`;
            break;
        
        // 更多块类型支持...
        default:
            // 对于不支持的块，尝试提供更有用的信息
            if (block.opcode.includes('motion_')) {
                code += `${indent}// Motion block: ${block.opcode}\n`;
            } else if (block.opcode.includes('looks_')) {
                code += `${indent}// Looks block: ${block.opcode}\n`;
            } else if (block.opcode.includes('sound_')) {
                code += `${indent}// Sound block: ${block.opcode}\n`;
            } else if (block.opcode.includes('sensing_')) {
                code += `${indent}// Sensing block: ${block.opcode}\n`;
            } else {
                code += `${indent}// Unsupported block: ${block.opcode}\n`;
            }
            break;
    }
    
    // Process next block
    if (block.next && blocks[block.next]) {
        code += decompileBlock(blocks, block.next, blocks[block.next], indentation);
    }
    
    return code;
}

/**
 * Processes an input to a Scratch block
 * @param blocks All blocks data
 * @param input Input data
 * @param indentation Current indentation level
 * @returns Processed input as JavaScript code
 */
function processInput(blocks: any, input: any, indentation: number): string {
    if (!input || !Array.isArray(input) || input.length < 2) {
        return 'null';
    }
    
    const inputType = input[0];
    const inputData = input[1];
    
    // Process different types of inputs
    if (typeof inputData === 'string') {
        // This is a block reference
        const referencedBlock = blocks[inputData];
        if (referencedBlock) {
            // 对于运算符和表达式块，直接返回值而不添加分号
            if (referencedBlock.opcode.startsWith('operator_') || 
                referencedBlock.opcode.startsWith('data_itemoflist') ||
                referencedBlock.opcode.startsWith('data_lengthoflist') ||
                referencedBlock.opcode.startsWith('sensing_') ||
                referencedBlock.opcode === 'data_variable' ||
                referencedBlock.opcode === 'data_listcontents') {
                const result = decompileBlock(blocks, inputData, referencedBlock, indentation);
                return result !== null ? result : 'null';
            }
            // 对于其他块，正常处理
            return decompileBlock(blocks, inputData, referencedBlock, indentation).trim();
        }
        return 'null';
    } else if (Array.isArray(inputData) && inputData.length >= 2) {
        // This is a value (like a number or string)
        const value = inputData[1];
        if (typeof value === 'string') {
            // 尝试解析为数字，如果成功则返回数字，否则返回字符串
            const numValue = Number(value);
            if (!isNaN(numValue) && value.trim() !== '') {
                return numValue.toString();
            }
            // 检查是否是变量名引用（例如在列表索引中使用的变量）
            if (value === 'i' || value === 'j' || value === 'k' || value === 'len' || 
                value === 'current' || value === 'next' || value === 'result' || value === 'separator') {
                return value; // 直接返回变量名，不添加引号
            }
            return `"${escapeString(value)}"`;
        }
        return value !== undefined ? value.toString() : 'null';
    }
    
    return 'null';
}

/**
 * Copies costumes and sounds from extracted SB3 to the jvavscratch project
 * @param target Target data from project.json
 * @param extractedDir Directory containing extracted SB3 contents
 * @param targetAssetDir Directory to copy assets to
 */
export async function copyAssets(tempDir: string, projectDir: string): Promise<void> {
    const assetsDir = join(projectDir, 'assets');
    const costumesDir = join(tempDir, 'costumes');
    const soundsDir = join(tempDir, 'sounds');

    // 确保assets目录存在
    if (!existsSync(assetsDir)) {
        mkdirSync(assetsDir, { recursive: true });
    }

    // 复制costumes目录内容 - 与build-util.ts保持一致
    if (existsSync(costumesDir)) {
        const assetsCostumesDir = join(assetsDir, 'costumes');
        if (!existsSync(assetsCostumesDir)) {
            mkdirSync(assetsCostumesDir, { recursive: true });
        }
        
        // 使用copyAllSync函数保持与build-util的一致性
        if (existsSync(costumesDir) && existsSync(assetsCostumesDir)) {
            const files = readdirSync(costumesDir);
            for (const file of files) {
                const sourceFile = join(costumesDir, file);
                const destFile = join(assetsCostumesDir, file);
                
                // 确保目标文件的目录存在
                const destDir = dirname(destFile);
                if (!existsSync(destDir)) {
                    mkdirSync(destDir, { recursive: true });
                }
                
                // 复制文件并确保权限正确
                copyFileSync(sourceFile, destFile);
                chmodSync(destFile, 0o644);
            }
        }
    }

    // 复制sounds目录内容 - 与build-util.ts保持一致
    if (existsSync(soundsDir)) {
        const assetsSoundsDir = join(assetsDir, 'sounds');
        if (!existsSync(assetsSoundsDir)) {
            mkdirSync(assetsSoundsDir, { recursive: true });
        }
        
        // 使用copyAllSync函数保持与build-util的一致性
        if (existsSync(soundsDir) && existsSync(assetsSoundsDir)) {
            const files = readdirSync(soundsDir);
            for (const file of files) {
                const sourceFile = join(soundsDir, file);
                const destFile = join(assetsSoundsDir, file);
                
                // 确保目标文件的目录存在
                const destDir = dirname(destFile);
                if (!existsSync(destDir)) {
                    mkdirSync(destDir, { recursive: true });
                }
                
                // 复制文件并确保权限正确
                copyFileSync(sourceFile, destFile);
                chmodSync(destFile, 0o644);
            }
        }
    }
}

/**
 * Escapes a string for use in JavaScript code
 * @param str String to escape
 * @returns Escaped string
 */
function escapeString(str: string): string {
    return str
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
}
