import Folder from '../models/folder.js';

export const getFolderTreeIds = async (folderId, userId) => {
  const folderIds = [folderId];
  const children = await Folder.find({
    parentFolder: folderId,
    user: userId,
  }).select('_id');

  for (const child of children) {
    const childTreeIds = await getFolderTreeIds(child._id, userId);
    folderIds.push(...childTreeIds);
  }

  return folderIds;
};

export const deleteFolderTree = async (folderId, userId) => {
  const folderIds = await getFolderTreeIds(folderId, userId);

  await Folder.deleteMany({
    _id: { $in: folderIds },
    user: userId,
  });

  return folderIds.length;
};
