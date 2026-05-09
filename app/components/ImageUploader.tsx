"use client";
import React, { useEffect } from 'react';

export function ImageUploader({ value, onChange, isMultiple = false, title = "选择图片", hint }: any) {
  
  // 监控点 1：看看父页面到底传了什么状态进来
  useEffect(() => {
    console.log(`📡 [雷达 - ${title}] 当前的 value 是:`, value);
  }, [value, title]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    console.log(`🎯 [操作 - ${title}] 你选中了文件，原始 files 集合:`, files);

    if (!files || files.length === 0) {
      console.log(`❌ [警告 - ${title}] 没有获取到任何文件！`);
      return;
    }

    if (isMultiple) {
      const fileArray = Array.from(files);
      console.log(`📤 [发射 - ${title}] 准备发给父页面的多图数组:`, fileArray);
      onChange(fileArray);
    } else {
      const singleFile = files[0];
      console.log(`📤 [发射 - ${title}] 准备发给父页面的单张图片:`, singleFile);
      onChange(singleFile);
    }
  };

  let displayText = "已选择：未选择";
  if (isMultiple && Array.isArray(value) && value.length > 0) {
    displayText = `已选择：${value.length} 张图片`;
  } else if (!isMultiple && value && (value as File).name) {
    displayText = `已选择：${(value as File).name}`;
  }

  return (
    <div className="border border-dashed border-gray-300 rounded-lg p-4 text-center hover:bg-gray-50 transition-colors">
      <label className="cursor-pointer block">
        <input
          type="file"
          className="hidden" 
          onChange={handleFileChange}
          multiple={isMultiple}
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        />
        <div className="flex items-center justify-center w-full py-2 px-4 border border-transparent text-sm font-medium rounded-md text-indigo-700 bg-indigo-50 hover:bg-indigo-100">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
          {title}
        </div>
      </label>
      <div className="mt-3 text-sm text-left">
        <p className="font-medium text-gray-700">{displayText}</p>
        {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
      </div>
    </div>
  );
}