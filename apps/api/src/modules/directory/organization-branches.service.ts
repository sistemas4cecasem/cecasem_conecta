import { Prisma } from '../../generated/prisma/client';
import { DirectoryError } from './directory.errors';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { DirectoryService } from './directory.service';
import { ContactsService } from './contacts.service';
import type { OrganizationBranchCreateDto, OrganizationBranchEditDto } from './organization-branch.dto';

@Injectable()
export class OrganizationBranchesService {
  constructor(private readonly prisma:PrismaService,private readonly directory:DirectoryService,private readonly contacts:ContactsService) {}
  async create(ownerId:string,input:OrganizationBranchCreateDto,actorId:string) {
    return this.prisma.$transaction(async tx=>{
      const {contactMethods,...fields}=input;
      const branch=await this.directory.createOrganizationWithinTransaction({...fields,name:'',branchOfId:ownerId,interestAreas:[]},actorId,tx);
      for(const contact of contactMethods??[]) await this.contacts.createAndAssociateWithinTransaction({organizationId:branch.id},contact,actorId,tx);
      return branch;
    },{timeout:15000});
  }
  async profile(ownerId:string,branchId:string) {
    return this.prisma.$transaction(async tx=>{
      const branch=await this.directory.getOrganizationWithinTransaction(branchId,tx);
      if(branch.branchOfId!==ownerId)throw new DirectoryError('ORGANIZATION_NOT_FOUND');
      return {branch,contacts:await this.contacts.organizationProfileContacts(branchId,tx)};
    },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
  }
  async edit(ownerId:string,branchId:string,input:OrganizationBranchEditDto,actorId:string) {
    return this.prisma.$transaction(async tx=>{
      const current=await this.directory.getOrganizationWithinTransaction(branchId,tx);
      if(current.branchOfId!==ownerId)throw new DirectoryError('ORGANIZATION_NOT_FOUND');
      const {contacts,expectedContacts,...fields}=input;
      const branch=await this.directory.editOrganizationWithinTransaction(branchId,{...fields,name:'',branchOfId:ownerId,interestAreas:[]},actorId,tx,ownerId);
      const changed=await this.contacts.reconcileOrganizationProfile(branchId,expectedContacts,contacts,actorId,tx);
      if(changed&&branch.version===input.expectedVersion)await tx.organization.update({where:{id:branchId},data:{version:{increment:1}}});
      return this.directory.getOrganizationWithinTransaction(branchId,tx);
    },{timeout:15000});
  }

}
